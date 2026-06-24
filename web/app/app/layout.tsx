import { MobileTabBar } from "@/components/veil/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MobileTabBar />
    </>
  );
}
