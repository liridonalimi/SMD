import PartnerDirectoryPage from "./PartnerDirectoryPage";
import { createSupplier, importSuppliers, listSuppliers, updateSupplier } from "../../services/partners";

export default function SuppliersPage() {
  return (
    <PartnerDirectoryPage
      title="Furnizuesit"
      subtitle="Regjistro dhe menaxho furnizuesit."
      entityLabel="Furnizues"
      listItems={listSuppliers}
      createItem={createSupplier}
      updateItem={updateSupplier}
      importFile={importSuppliers}
    />
  );
}
