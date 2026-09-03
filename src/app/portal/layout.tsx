import type { Metadata } from "next";
import { NotificationCenter } from "@/components/NotificationCenter";
import { LoginSecurityMonitor } from "@/components/LoginSecurityMonitor";

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

export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>
    {children}
    <LoginSecurityMonitor />
    <NotificationCenter />
  </>;
}
