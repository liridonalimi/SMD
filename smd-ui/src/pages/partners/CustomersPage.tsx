import PartnerDirectoryPage from "./PartnerDirectoryPage";
import { createCustomer, importCustomers, listCustomers, updateCustomer } from "../../services/partners";

export default function CustomersPage() {
  return (
    <PartnerDirectoryPage
      title="Klientet"
      subtitle="Regjistro dhe menaxho klientet."
      entityLabel="Klient"
      listItems={listCustomers}
      createItem={createCustomer}
      updateItem={updateCustomer}
      importFile={importCustomers}
    />
  );
}
