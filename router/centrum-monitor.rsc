# Centrum Service monitoring-agent template for RouterOS 7.15+
#
# Do NOT store a live monitor credential in source control.
# The production script is generated from Admin -> Network -> Monitoring Agents.
#
# Replace both placeholders only when using this file as a manual template:
#   __EDGE_FUNCTION_URL__ -> https://YOUR_PROJECT.supabase.co/functions/v1/network-monitor
#   __MONITOR_KEY__       -> the credential generated for this monitoring agent
#
# This script only fetches this agent's assigned target list, pings each target,
# and posts its status. It does not modify routes, firewall, PPPoE, queues, or
# customer configuration.

/system scheduler remove [find where name="centrum-monitor"]
/system script remove [find where name="centrum-monitor"]

/system script
add name=centrum-monitor source={
    :local endpoint "__EDGE_FUNCTION_URL__";
    :local monitorKey "__MONITOR_KEY__";
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

        :local body ("{\"node_id\":\"" . $nodeId . "\",\"status\":\"" . $state . "\"}");
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
