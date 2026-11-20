import React from "react";
import { Alert } from "@mantine/core";
import { __ } from "@wordpress/i18n";

export default function ServiceNote(_props: Record<string, unknown>) {
  return (
    <Alert>
      {__("These settings are managed through the WP Suite Commerce service.", "smartcloud-commerce")}
    </Alert>
  );
}
