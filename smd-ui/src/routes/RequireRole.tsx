import { Navigate, useLocation } from "react-router-dom";
import { getSessionUser, type UserRole } from "../shared/session";

export default function RequireRole({
    roles,
    children,
}: {
    roles: UserRole[];
    children: React.ReactNode;
}) {
    const loc = useLocation();
    const me = getSessionUser();

    if (!me?.role && me?.role !== 0) {
        return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
    }

    if (!roles.includes(me.role)) {
        return (
            <div style={{ padding: 16 }}>
                <h2 style={{ marginTop: 0 }}>Nuk keni qasje</h2>
                <div style={{ opacity: 0.8 }}>
                    Kjo faqe eshte e kufizuar.
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
