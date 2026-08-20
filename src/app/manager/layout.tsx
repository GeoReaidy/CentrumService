import type { Metadata } from "next";
import { NotificationCenter } from "@/components/NotificationCenter";

export const metadata: Metadata = {
  title: "Manager Console | Centrum Service",
  robots: { index: false, follow: false },
};

export default function ManagerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}<NotificationCenter /></>;
}
