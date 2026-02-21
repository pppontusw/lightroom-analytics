import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchCatalogs, type Catalog } from "@/lib/api";

export interface CatalogContextValue {
  catalogs: Catalog[];
  selectedCatalog: string | null;
  setSelectedCatalog: (path: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog must be used within a CatalogProvider");
  }
  return ctx;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCatalogs();
      setCatalogs(result);
      // Auto-select if only one catalog or none selected yet
      if (result.length === 1) {
        setSelectedCatalog(result[0].path);
      } else if (
        result.length > 0 &&
        selectedCatalog === null
      ) {
        setSelectedCatalog(result[0].path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load catalogs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CatalogContext.Provider
      value={{
        catalogs,
        selectedCatalog,
        setSelectedCatalog,
        loading,
        error,
        reload: load,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}
