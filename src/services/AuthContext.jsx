import { createContext, useState, useEffect } from "react";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [farmer, setFarmer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage masa page load
    const token = localStorage.getItem("token");
    const storedFarmer = localStorage.getItem("farmer");

    if (token && storedFarmer) {
      setFarmer(JSON.parse(storedFarmer));
    }
    setLoading(false);
  }, []);

  const login = (token, farmerData) => {
    localStorage.setItem("token", token);
    localStorage.setItem("farmer", JSON.stringify(farmerData));
    setFarmer(farmerData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("farmer");
    setFarmer(null);
  };

  return (
    <AuthContext.Provider value={{ farmer, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
