import { lazy } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

const EmployeesPage = lazy(() => import('./components').then((m) => ({ default: m.EmployeesPage })));
const EmployeeEditorPage = lazy(() => import('./components').then((m) => ({ default: m.EmployeeEditorPage })));
const DepartmentsPage = lazy(() => import('./components').then((m) => ({ default: m.DepartmentsPage })));
const JobTitlesPage = lazy(() => import('./components').then((m) => ({ default: m.JobTitlesPage })));
const SalaryComponentsPage = lazy(() => import('./components').then((m) => ({ default: m.SalaryComponentsPage })));
const ShiftsPage = lazy(() => import('./components').then((m) => ({ default: m.ShiftsPage })));
const HolidaysPage = lazy(() => import('./components').then((m) => ({ default: m.HolidaysPage })));
const AttendancePage = lazy(() => import('./components').then((m) => ({ default: m.AttendancePage })));
const AttendanceImportPage = lazy(() => import('./components').then((m) => ({ default: m.AttendanceImportPage })));
const LeaveRequestsPage = lazy(() => import('./components').then((m) => ({ default: m.LeaveRequestsPage })));
const LeaveBalancesPage = lazy(() => import('./components').then((m) => ({ default: m.LeaveBalancesPage })));
const LeaveTypesPage = lazy(() => import('./components').then((m) => ({ default: m.LeaveTypesPage })));
const LoansPage = lazy(() => import('./components').then((m) => ({ default: m.LoansPage })));
const PayAdjustmentsPage = lazy(() => import('./components').then((m) => ({ default: m.PayAdjustmentsPage })));
const PayrollRunsPage = lazy(() => import('./components').then((m) => ({ default: m.PayrollRunsPage })));
const PayrollRunPage = lazy(() => import('./components').then((m) => ({ default: m.PayrollRunPage })));
const SalaryRegisterPage = lazy(() => import('./components').then((m) => ({ default: m.SalaryRegisterPage })));

/** HR (الموارد البشرية): employees and the organisation structure. */
export const hrRoutes: RouteObject[] = [
  {
    path: 'hr',
    element: <Outlet />,
    children: [
      { index: true, element: <Navigate to="employees" replace /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'employees/new', element: <EmployeeEditorPage /> },
      { path: 'employees/:id', element: <EmployeeEditorPage /> },
      { path: 'departments', element: <DepartmentsPage /> },
      { path: 'job-titles', element: <JobTitlesPage /> },
      { path: 'salary-components', element: <SalaryComponentsPage /> },
      { path: 'salaries', element: <SalaryRegisterPage /> },
      { path: 'attendance', element: <AttendancePage /> },
      { path: 'attendance/import', element: <AttendanceImportPage /> },
      { path: 'shifts', element: <ShiftsPage /> },
      { path: 'holidays', element: <HolidaysPage /> },
      { path: 'leaves', element: <LeaveRequestsPage /> },
      { path: 'leave-balances', element: <LeaveBalancesPage /> },
      { path: 'leave-types', element: <LeaveTypesPage /> },
      { path: 'loans', element: <LoansPage /> },
      { path: 'payroll', element: <PayrollRunsPage /> },
      { path: 'payroll/:id', element: <PayrollRunPage /> },
      { path: 'pay-adjustments', element: <PayAdjustmentsPage /> },
    ],
  },
];
