import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../app/shell/AppLayout";
import RequireAuth from "../app/shell/RequireAuth";
import RequireRole from "./RequireRole";

import LoginPage from "../pages/auth/LoginPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import DocumentCreatePage from "../pages/documents/DocumentCreatePage";

import InboundList from "../pages/inbound/InboundList";
import InboundDetails from "../pages/inbound/InboundDetails";

import OutboundList from "../pages/outbound/OutboundList";
import OutboundDetails from "../pages/outbound/OutboundDetails";
import OutboundPickList from "../pages/outbound/OutboundPickList";

import InventoryPage from "../pages/inventory/InventoryPage";
import CycleCountList from "../pages/cycleCounts/CycleCountList";
import CycleCountDetails from "../pages/cycleCounts/CycleCountDetails";
import ReturnsList from "../pages/returns/ReturnsList";
import ReturnDetails from "../pages/returns/ReturnDetails";
import LabelsPage from "../pages/labels/LabelsPage";
import StockMovementsPage from "../pages/stockMovements/StockMovementsPage";
import ProductsPage from "../pages/products/ProductsPage";
import ProductHistoryPage from "../pages/products/ProductHistoryPage";
import PartnerFinancePage from "../pages/finance/PartnerFinancePage";
import PurchaseOrdersPage from "../pages/orders/PurchaseOrdersPage";
import SalesOrdersPage from "../pages/orders/SalesOrdersPage";
import WarehouseTasksPage from "../pages/warehouseTasks/WarehouseTasksPage";
import WarehouseNetworkPage from "../pages/warehouseNetwork/WarehouseNetworkPage";
import CT40ScanPage from "../pages/ct40/CT40ScanPage";

import AuditLogsPage from "../pages/audit/AuditLogsPage";
import AdminUsersPage from "../pages/admin/AdminUsersPage";
import CustomersPage from "../pages/partners/CustomersPage";
import SuppliersPage from "../pages/partners/SuppliersPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },

  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/documents/new", element: <DocumentCreatePage /> },

          { path: "/inbound", element: <InboundList /> },
          { path: "/inbound/:id", element: <InboundDetails /> },

          { path: "/outbound", element: <OutboundList /> },
          { path: "/outbound/:id/pick-list", element: <OutboundPickList /> },
          { path: "/outbound/:id", element: <OutboundDetails /> },
          /*new*/
          { path: "/inventory", element: <InventoryPage /> },
          { path: "/cycle-counts", element: <CycleCountList /> },
          { path: "/cycle-counts/:id", element: <CycleCountDetails /> },
          { path: "/returns", element: <ReturnsList /> },
          { path: "/purchase-orders", element: <PurchaseOrdersPage /> },
          { path: "/sales-orders", element: <SalesOrdersPage /> },
          { path: "/warehouse-tasks", element: <WarehouseTasksPage /> },
          { path: "/warehouse-network", element: <WarehouseNetworkPage /> },
          { path: "/ct40-scan", element: <CT40ScanPage /> },
          { path: "/returns/:id", element: <ReturnDetails /> },
          { path: "/labels", element: <LabelsPage /> },
          { path: "/stock-movements", element: <StockMovementsPage /> },
          { path: "/products", element: <ProductsPage /> },
          { path: "/products/:id/history", element: <ProductHistoryPage /> },
          { path: "/customers", element: <CustomersPage /> },
          { path: "/suppliers", element: <SuppliersPage /> },
          { path: "/finance", element: <PartnerFinancePage /> },
          { path: "/audit-logs", element: ( <RequireRole roles={[0]}> <AuditLogsPage /> </RequireRole>), },
          { path: "/admin/users", element: (<RequireRole roles={[0]}><AdminUsersPage /></RequireRole>) },

        ],
      },
    ],
  },
]);
