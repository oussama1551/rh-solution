import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./lib/auth";
import { AttendancePunchesPage } from "./pages/AttendancePunchesPage";
import { AdvancedTreatmentPage } from "./pages/AdvancedTreatmentPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyAbsencesPage } from "./pages/DailyAbsencesPage";
import { DevicesPage } from "./pages/DevicesPage";
import { EmployeeDetailPage } from "./pages/EmployeeDetailPage";
import { EmployeeContractsPage } from "./pages/EmployeeContractsPage";
import { EmployeeBioTimeFormPage } from "./pages/EmployeeBioTimeFormPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LoginPage } from "./pages/LoginPage";
import { ManualAbsenceDeclarationPage } from "./pages/ManualAbsenceDeclarationPage";
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
import { OvertimeSummaryPage } from "./pages/OvertimeSummaryPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { NotFoundPage, UsersAdminPage } from "./pages/SimplePages";
import { SyncAdminPage } from "./pages/SyncAdminPage";
import { SapDirectoryPage } from "./pages/SapDirectoryPage";
import { ValidationPage } from "./pages/ValidationPage";
import { JobDescriptionsLibraryPage } from "./pages/JobDescriptionsLibraryPage";
import { JobDescriptionBuilderPage } from "./pages/JobDescriptionBuilderPage";
import { JobDescriptionWorkflowPage } from "./pages/JobDescriptionWorkflowPage";
import { JobDescriptionDocumentPage } from "./pages/JobDescriptionDocumentPage";
import { JobDescriptionWizardPage } from "./pages/JobDescriptionWizardPage";
import { JobDescriptionImportPage } from "./pages/JobDescriptionImportPage";
import { JobDescriptionDocumentsPage } from "./pages/JobDescriptionDocumentsPage";
import { ResignationDecisionSettingsPage } from "./pages/ResignationDecisionSettingsPage";

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
        <Route path="/manual-absences" element={<ManualAbsenceDeclarationPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employee-contracts" element={<EmployeeContractsPage />} />
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
        <Route path="/reports/overtime-summary" element={<OvertimeSummaryPage />} />
        <Route path="/advanced-treatment" element={<AdvancedTreatmentPage />} />
        <Route path="/admin/payroll-control" element={<PayrollControlPage />} />
        <Route path="/admin/sync" element={<SyncAdminPage />} />
        <Route path="/admin/sap-directory" element={<SapDirectoryPage />} />
        <Route path="/admin/users" element={<UsersAdminPage />} />
        <Route path="/admin/logs" element={<AuditLogsPage />} />
        <Route path="/admin/resignation-decisions" element={<ResignationDecisionSettingsPage />} />
        <Route path="/job-descriptions" element={<JobDescriptionsLibraryPage />} />
        <Route path="/job-descriptions/templates/:id/builder" element={<JobDescriptionBuilderPage />} />
        <Route path="/job-descriptions/validation" element={<JobDescriptionWorkflowPage />} />
        <Route path="/job-descriptions/documents/:id" element={<JobDescriptionDocumentPage />} />
        <Route path="/job-descriptions/documents" element={<JobDescriptionDocumentsPage />} />
        <Route path="/job-descriptions/documents/:id/builder" element={<JobDescriptionBuilderPage />} />
        <Route path="/job-descriptions/new" element={<JobDescriptionWizardPage />} />
        <Route path="/job-descriptions/import" element={<JobDescriptionImportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
