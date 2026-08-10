import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./lib/auth";
import { AttendancePunchesPage } from "./pages/AttendancePunchesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyAbsencesPage } from "./pages/DailyAbsencesPage";
import { DevicesPage } from "./pages/DevicesPage";
import { EmployeeDetailPage } from "./pages/EmployeeDetailPage";
import { EmployeeBioTimeFormPage } from "./pages/EmployeeBioTimeFormPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LoginPage } from "./pages/LoginPage";
import { LeaveDeclarationPage } from "./pages/LeaveDeclarationPage";
import { MessagesPage } from "./pages/MessagesPage";
import { OrgChartPage } from "./pages/OrgChartPage";
import { OvertimeDeclarationPage } from "./pages/OvertimeDeclarationPage";
import { PayrollControlPage } from "./pages/PayrollControlPage";
import { PresumedAbsencesPage } from "./pages/PresumedAbsencesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ResignedEmployeesPage } from "./pages/ResignedEmployeesPage";
import { SickLeaveDeclarationPage } from "./pages/SickLeaveDeclarationPage";
import { SummaryReportPage } from "./pages/SummaryReportPage";
import { NotFoundPage, UsersAdminPage } from "./pages/SimplePages";
import { SyncAdminPage } from "./pages/SyncAdminPage";
import { SapDirectoryPage } from "./pages/SapDirectoryPage";
import { ValidationPage } from "./pages/ValidationPage";

function Protected() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Chargement RH Solution...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/realtime" element={<AttendancePunchesPage />} />
        <Route path="/absences" element={<DailyAbsencesPage />} />
        <Route path="/presumed-absences" element={<PresumedAbsencesPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/resigned" element={<ResignedEmployeesPage />} />
        <Route path="/employees/new" element={<EmployeeBioTimeFormPage />} />
        <Route path="/employees/:id/edit" element={<EmployeeBioTimeFormPage />} />
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="/validation" element={<ValidationPage />} />
        <Route path="/overtime" element={<OvertimeDeclarationPage />} />
        <Route path="/sick-leaves" element={<SickLeaveDeclarationPage />} />
        <Route path="/leaves" element={<LeaveDeclarationPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/org" element={<OrgChartPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/summary" element={<SummaryReportPage />} />
        <Route path="/admin/payroll-control" element={<PayrollControlPage />} />
        <Route path="/admin/sync" element={<SyncAdminPage />} />
        <Route path="/admin/sap-directory" element={<SapDirectoryPage />} />
        <Route path="/admin/users" element={<UsersAdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
