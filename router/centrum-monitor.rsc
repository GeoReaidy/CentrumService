# Centrum Service monitoring script for RouterOS 7.15+
# Replace BOTH placeholders before importing/running:
#   __EDGE_FUNCTION_URL__ -> https://YOUR_PROJECT.supabase.co/functions/v1/network-monitor
#   __MONITOR_KEY__       -> your dedicated CENTRUM_MONITOR_KEY
#
# This script only FETCHES the target list, PINGS each target, and POSTS status.
# It does not modify routes, firewall, PPPoE, queues, or customer configuration.

/system script
add name=centrum-monitor source={
    :local endpoint "https://zlcikwwrgdnkscfitfqg.supabase.co/functions/v1/network-monitor";
    :local monitorKey "a1799c42a95a9d2e7f0c18212bebb30c36f2c37744bad5e7505b2c10cd2c9cf7";
    :local authHeader ("X-Centrum-Monitor-Key:" . $monitorKey);
    :local response;

    :onerror fetchError in={
        :set response [/tool fetch url=$endpoint http-method=get http-header-field=$authHeader check-certificate=no output=user as-value];
    } do={
        :log warning ("Centrum monitor: could not fetch targets: " . $fetchError);
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
add name=centrum-monitor interval=30s on-event=centrum-monitor start-time=startup disabled=yes
