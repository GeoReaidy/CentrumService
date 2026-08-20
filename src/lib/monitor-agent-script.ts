export type MonitorAgentScriptInput = {
  agentName: string;
  endpoint: string;
  token: string;
};

export type MonitorAgentInstructionsInput = {
  agentName: string;
  routerIp: string | null;
  scriptFileName: string;
};

export function getMonitorAgentFileNames(agentName: string) {
  const safePart = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "monitor";
  return {
    scriptFileName: `centrum-monitor-${safePart}.rsc`,
    instructionsFileName: `centrum-monitor-${safePart}-README.md`,
  };
}

export function buildMonitorAgentInstructions({ agentName, routerIp, scriptFileName }: MonitorAgentInstructionsInput) {
  const displayName = agentName.replace(/[\r\n]+/g, " ").trim() || "Centrum Monitor";
  const displayIp = routerIp?.replace(/[\r\n]+/g, " ").trim().split("/")[0] || "the monitoring router";

  return `# Centrum Service Monitor Setup — ${displayName}

This file explains how to install the generated Centrum monitoring agent on **${displayIp}** using MikroTik WinBox / RouterOS.

## Files

Keep these two generated files together:

- \`${scriptFileName}\` — RouterOS setup script. **Treat this file as sensitive because it contains this monitor's private credential.**
- This README — installation and verification steps. It does not contain the credential.

## Requirements

- MikroTik RouterOS **7.15 or newer**.
- The router must be able to reach the internet and the Centrum Supabase Edge Function over HTTPS.
- Use an administrator account with permission to create scripts, schedulers, ping targets, and use \`/tool fetch\`.

## Install with WinBox

1. Open **WinBox** and connect to **${displayIp}**.
2. Open **Files**.
3. Drag \`${scriptFileName}\` into the Files window, or use the upload control.
4. Open **Terminal** in WinBox.
5. Optional on RouterOS 7.16+: validate the file first without changing configuration:

   \`\`\`routeros
   /import file-name=\"${scriptFileName}\" verbose=yes dry-run
   \`\`\`

6. Install the monitoring agent:

   \`\`\`routeros
   /import file-name=\"${scriptFileName}\"
   \`\`\`

The generated file removes an older \`centrum-monitor\` script/scheduler with the same name, creates the new ones, enables the 30-second scheduler, and runs the monitor once immediately. It does **not** alter routes, firewall rules, PPPoE, queues, or customer configuration.

## Verify the installation

Run these commands in WinBox Terminal:

\`\`\`routeros
/system script print detail where name=\"centrum-monitor\"
/system scheduler print detail where name=\"centrum-monitor\"
\`\`\`

The scheduler should show \`interval=30s\` and should not have the disabled flag.

Run an immediate manual check whenever needed:

\`\`\`routeros
/system script run centrum-monitor
\`\`\`

Then return to **Centrum Admin → Network → Monitoring Agents**. This monitor should begin showing a fresh heartbeat, and its assigned service nodes should begin receiving probe results.

## If the scheduler is disabled

Enable it with:

\`\`\`routeros
/system scheduler enable [find where name=\"centrum-monitor\"]
\`\`\`

Run the script once immediately afterward:

\`\`\`routeros
/system script run centrum-monitor
\`\`\`

## Troubleshooting

### Check Centrum monitor logs

\`\`\`routeros
/log print where message~\"Centrum monitor\"
\`\`\`

Warnings here normally indicate an HTTPS/fetch problem or a failed report.

### Check that the router can ping its assigned nodes

Use the same IP shown for a service node in Centrum Admin:

\`\`\`routeros
/ping address=<NODE-IP> count=3
\`\`\`

If this router cannot reach a particular node, remove that node from this monitor's target list in Centrum Admin. Another monitoring agent can still watch it.

### Reinstall / rotate the monitor credential

If the setup file is lost or exposed, do **not** reuse an old credential. In Centrum Admin, open **Network → Monitoring Agents**, click **Regenerate Setup**, download the new \`.rsc\` and README, upload the new \`.rsc\` to WinBox, and import it again. The regenerated credential invalidates the previous script credential.

### TLS certificate note

The current Centrum-generated RouterOS script uses \`check-certificate=no\` because the existing router setup previously did not trust the required HTTPS certificate chain. Once the router has the correct CA trust configured, change both occurrences in the generated script to \`check-certificate=yes\`.

## Security cleanup

After the router is confirmed online:

- Store \`${scriptFileName}\` securely or delete the local copy if you do not need it.
- Do not send the \`.rsc\` file through public chat or email; it contains this monitor's private credential.
- If the file is exposed, use **Regenerate Setup** immediately.
`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createMonitorAgentToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function buildMonitorAgentSetupScript({ agentName, endpoint, token }: MonitorAgentScriptInput) {
  const safeAgentName = agentName.replace(/[\r\n]+/g, " ").replaceAll('"', "'").trim() || "Centrum Monitor";
  const safeEndpoint = endpoint.replace(/[\r\n\"]/g, "");
  const safeToken = token.replace(/[^a-fA-F0-9]/g, "");

  return `# Centrum Service monitoring agent: ${safeAgentName}
# RouterOS 7.15+
# Generated by Centrum Admin. This credential belongs only to this monitor.
# If this script is exposed, regenerate it from Admin -> Network -> Monitoring Agents.
#
# This script only fetches assigned targets, pings them, and reports status.
# It does not modify routes, firewall, PPPoE, queues, or customer configuration.
#
# NOTE: check-certificate=no is retained for the current Centrum RouterOS setup.
# Once the router trusts the Supabase certificate chain, change both occurrences to yes.

/system scheduler remove [find where name="centrum-monitor"]
/system script remove [find where name="centrum-monitor"]

/system script
add name=centrum-monitor source={
    :local endpoint "${safeEndpoint}";
    :local monitorKey "${safeToken}";
    :local authHeader ("X-Centrum-Monitor-Key:" . $monitorKey);
    :local response;

    :onerror fetchError in={
        :set response [/tool fetch url=$endpoint http-method=get http-header-field=$authHeader check-certificate=no output=user as-value];
    } do={
        :log warning ("Centrum monitor: could not fetch assigned targets: " . $fetchError);
        :return;
    };

    :if (($response->"status") != "finished") do={
        :log warning "Centrum monitor: target request did not finish";
        :return;
    };

    :local payload [:deserialize from=json value=($response->"data")];
    :local targets ($payload->"targets");

    :foreach target in=$targets do={
        :local nodeId ($target->"id");
        :local nodeName ($target->"name");
        :local targetIp ($target->"ip");
        :local received [/ping address=$targetIp count=3 interval=300ms];
        :local state "down";
        :if ($received > 0) do={ :set state "up"; };

        :local body ("{\\\"node_id\\\":\\\"" . $nodeId . "\\\",\\\"status\\\":\\\"" . $state . "\\\"}");
        :onerror postError in={
            /tool fetch url=$endpoint http-method=post http-header-field=("Content-Type:application/json," . $authHeader) http-data=$body check-certificate=no output=none;
        } do={
            :log warning ("Centrum monitor: failed to report " . $nodeName . ": " . $postError);
        };
    };
}

/system scheduler
add name=centrum-monitor interval=30s on-event=centrum-monitor start-time=startup disabled=no

/system script run centrum-monitor
`;
}
