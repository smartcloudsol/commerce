const { formatStripePrice } = require("./money.cjs");
/** All provider strings are rendered as text; a context change discards previews and in-flight results. */
function createSubscriptionUI({
  api,
  root = document,
  getContext,
  translate = (s) => s,
}) {
  let generation = 0,
    active = true;
  const nodes = () =>
    Array.from(root.querySelectorAll("[data-commerce-subscriptions]"));
  function el(tag, text, className) {
    const e = root.createElement(tag);
    if (text !== undefined) e.textContent = text;
    e.className = className || "sc-commerce-subscription-" + tag;
    return e;
  }
  function invalidate() {
    generation++;
    for (const node of nodes())
      node.replaceChildren(
        el("p", translate("Sign in to manage subscriptions.")),
      );
  }
  async function refresh() {
    const current = ++generation,
      context = getContext();
    const valid = () =>
      active && current === generation && context === getContext();
    for (const node of nodes())
      node.replaceChildren(el("p", translate("Loading subscriptions…")));
    if (!nodes().length) return;
    try {
      const data = await api.subscriptions();
      if (!valid()) return;
      for (const node of nodes()) {
        node.replaceChildren();
        node.classList.add("sc-commerce-subscriptions");
        const status = el("p", "", "sc-commerce-subscriptions-status");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const controls = [];
        function button(text, fn, parent) {
          const b = el(
            "button",
            text,
            "wp-element-button sc-commerce-button sc-commerce-subscription-action",
          );
          b.type = "button";
          b.addEventListener("click", () => void fn());
          controls.push(b);
          parent.append(b);
          return b;
        }
        const lock = (value) => {
          for (const b of controls) b.disabled = value;
        };
        async function preview(subscription, action, targetOfferId) {
          if (!valid()) return;
          lock(true);
          status.textContent = translate("Preparing a change preview…");
          try {
            const p = await api.previewSubscription({
              subscriptionId: subscription.id,
              action,
              ...(targetOfferId ? { targetOfferId } : {}),
            });
            if (!valid()) return;
            const panel = el(
              "section",
              undefined,
              "sc-commerce-change-preview",
            );
            panel.setAttribute(
              "aria-label",
              translate("Confirm subscription change"),
            );
            panel.append(
              el("h3", translate("Review this change")),
              el(
                "p",
                p.currentPlan + (p.targetPlan ? " → " + p.targetPlan : ""),
              ),
              el("p", new Date(p.effectiveAt * 1000).toLocaleString()),
              el("p", p.explanation),
            );
            if (p.estimatedInvoiceTotal !== undefined)
              panel.append(
                el(
                  "p",
                  translate(
                    p.amountBasis === "base_price"
                      ? "Plan base price"
                      : "Estimated invoice total",
                  ) +
                    ": " +
                    (p.estimatedInvoiceTotal < 0 ? "−" : "") +
                    formatStripePrice(
                      Math.abs(p.estimatedInvoiceTotal),
                      p.currency,
                    ),
                ),
              );
            panel.append(
              el(
                "p",
                p.dueNow
                  ? translate("Payment may be required immediately.")
                  : translate(
                      "No immediate payment is requested by this action.",
                    ),
              ),
            );
            button(
              translate("Cancel"),
              () => {
                panel.remove();
                lock(false);
                status.textContent = "";
              },
              panel,
            );
            const confirm = button(
              translate("Confirm change"),
              async () => {
                if (!valid() || Date.now() >= p.expiresAt * 1000) {
                  panel.remove();
                  lock(false);
                  status.textContent = translate(
                    "This preview expired. Request a new preview.",
                  );
                  return;
                }
                lock(true);
                confirm.disabled = true;
                status.textContent = translate(
                  "Applying the confirmed change…",
                );
                try {
                  const result = await api.confirmSubscription(p.previewId);
                  if (!valid()) return;
                  panel.replaceChildren();
                  status.textContent =
                    result.status === "done"
                      ? translate(
                          "The change is complete. Refresh subscriptions to see its current state.",
                        )
                      : result.status === "pending_payment"
                        ? translate(
                            "Complete the invoice payment to finish this change.",
                          )
                        : translate(
                            "The result needs review. Check your subscription before starting another change.",
                          );
                  if (result.billingUrl) {
                    const link = el(
                      "a",
                      translate("Complete payment"),
                      "wp-element-button sc-commerce-payment-link",
                    );
                    link.href = result.billingUrl;
                    link.rel = "noopener noreferrer";
                    panel.append(link);
                  }
                  if (result.status === "done")
                    button(translate("Refresh subscriptions"), refresh, panel);
                } catch {
                  if (valid())
                    status.textContent = translate(
                      "The result could not be confirmed. Check your subscription before retrying.",
                    );
                }
              },
              panel,
            );
            node.append(panel);
            status.textContent = "";
            confirm.focus();
          } catch {
            if (valid()) {
              lock(false);
              status.textContent = translate(
                "This change is unavailable. Refresh subscriptions and review the allowed changes.",
              );
            }
          }
        }
        if (!data.subscriptions.length)
          node.append(el("p", translate("No active subscriptions.")));
        for (const subscription of data.subscriptions) {
          const card = el("section", undefined, "sc-commerce-subscription");
          card.append(
            el("h3", subscription.currentPlan),
            el("p", subscription.familyName),
          );
          for (const target of subscription.targets) {
            button(
              target.name +
                " — " +
                formatStripePrice(target.amount, target.currency) +
                " / " +
                target.interval,
              () => preview(subscription, "change", target.offerId),
              card,
            );
          }
          if (subscription.canUndoChange)
            button(
              translate("Undo scheduled change"),
              () => preview(subscription, "undo_change"),
              card,
            );
          if (subscription.canCancel || subscription.cancelAtPeriodEnd)
            button(
              subscription.cancelAtPeriodEnd
                ? translate("Keep subscription")
                : translate("Cancel subscription"),
              () =>
                preview(
                  subscription,
                  subscription.cancelAtPeriodEnd ? "resume" : "cancel",
                ),
              card,
            );
          if (subscription.familyId)
            button(
              translate("Open billing portal"),
              async () => {
                if (!valid()) return;
                lock(true);
                try {
                  const result = await api.portal(location.href, {
                    subscriptionId: subscription.id,
                    familyId: subscription.familyId,
                  });
                  if (valid()) location.assign(result.url);
                } catch {
                  if (valid()) {
                    lock(false);
                    status.textContent = translate(
                      "The billing portal is unavailable. Please try again.",
                    );
                  }
                }
              },
              card,
            );
          node.append(card);
        }
        node.append(status);
        button(translate("Refresh subscriptions"), refresh, node);
      }
    } catch {
      if (valid())
        for (const node of nodes()) {
          node.replaceChildren(
            el(
              "p",
              translate(
                "Subscription management is unavailable. Sign in and check that this site has an active subscription policy.",
              ),
            ),
          );
          const b = el(
            "button",
            translate("Retry"),
            "wp-element-button sc-commerce-button",
          );
          b.type = "button";
          b.addEventListener("click", () => void refresh());
          node.append(b);
        }
    }
  }
  return {
    refresh,
    invalidate,
    dispose() {
      active = false;
      invalidate();
    },
  };
}
module.exports = { createSubscriptionUI };
