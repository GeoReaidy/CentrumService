import type { Metadata } from "next";
import { NotificationCenter } from "@/components/NotificationCenter";
import { LoginSecurityMonitor } from "@/components/LoginSecurityMonitor";
import { StaffMfaGate } from "@/components/StaffMfaGate";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <StaffMfaGate>
    {children}
    <LoginSecurityMonitor />
    <NotificationCenter />
  </StaffMfaGate>;
}
