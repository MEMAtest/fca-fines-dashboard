import { Navigate, useLocation } from 'react-router-dom';
import { useHomepageVisit } from '../hooks/useHomepageVisit';

interface Props {
  children: React.ReactNode;
}

export function RequireHomepageVisit({ children }: Props) {
  const { hasVisitedHomepage } = useHomepageVisit();
  const location = useLocation();

  if (!hasVisitedHomepage) {
    // Redirect to homepage, preserving the intended destination
    return (
      <Navigate
        to="/"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }

  return <>{children}</>;
}
