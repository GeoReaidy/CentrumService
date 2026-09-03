import type { Metadata } from "next";
import { NotificationCenter } from "@/components/NotificationCenter";
import { LoginSecurityMonitor } from "@/components/LoginSecurityMonitor";
import { StaffMfaGate } from "@/components/StaffMfaGate";

export const metadata: Metadata = {
  title: "Manager Console | Centrum Service",
  robots: { index: false, follow: false },
};

export default function ManagerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <StaffMfaGate>{children}<LoginSecurityMonitor /><NotificationCenter /></StaffMfaGate>;
}
