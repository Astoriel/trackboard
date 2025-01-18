import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastContainer } from "@/components/ui/ToastContainer";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="app-frame">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-2)]">
          <Header />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <ToastContainer />
      </div>
    </div>
  );
}
