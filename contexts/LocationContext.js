import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Location from 'expo-location';
import LOCATIONIQ_KEY from '../src/config.js';

export const LocationContext = createContext();

export const LocationProvider = ({ children }) => {
  // Estado para guardar la ubicación actual (latitud y longitud)
  const [currentLocation, setCurrentLocation] = useState(null);
  // Estado para guardar la dirección obtenida por reverse geocoding
  const [currentAddress, setCurrentAddress] = useState('');
  // Estado para indicar si se está cargando la ubicación
  const [isLoading, setIsLoading] = useState(true);
  // Estado para guardar errores relacionados con la ubicación
  const [error, setError] = useState(null);

  // useEffect se ejecuta al montar el componente para obtener la ubicación
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Función para obtener la ubicación actual y la dirección
  const getCurrentLocation = async () => {
    try {
      setIsLoading(true); // Indica que se está cargando
      setError(null);     // Reinicia el error
      
      // Solicita permisos de ubicación al usuario
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Si el permiso es denegado, muestra error y dirección genérica
        setError('Permiso de ubicación denegado');
        setCurrentAddress('Ubicación actual');
        return;
      }
      
      // Obtiene la posición actual del dispositivo
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      // Guarda la ubicación en el estado
      setCurrentLocation({ latitude, longitude });
      
      // Realiza una petición a LocationIQ para obtener la dirección (reverse geocoding)
      const response = await fetch(
        `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_KEY}&lat=${latitude}&lon=${longitude}&format=json`
      );
      const data = await response.json();
      
      if (data.display_name) {
        // Si se obtiene una dirección, toma solo la primera parte (por ejemplo, el nombre de la calle)
        const addressParts = data.display_name.split(',');
        setCurrentAddress(addressParts[0]);
      } else {
        // Si no se obtiene dirección, muestra texto genérico
        setCurrentAddress('Ubicación actual');
      }
    } catch (error) {
      // Maneja errores en el proceso de obtención de ubicación
      console.error('Error obteniendo ubicación:', error);
      setError('Error obteniendo ubicación');
      setCurrentAddress('Ubicación actual');
    } finally {
      // Finaliza la carga
      setIsLoading(false);
    }
  };

  // Función para refrescar la ubicación manualmente
  const refreshLocation = () => {
    getCurrentLocation();
  };

  // Provee los valores y funciones del contexto a los componentes hijos
  return (
    <LocationContext.Provider value={{
      currentLocation,   // Latitud y longitud actual
      currentAddress,    // Dirección obtenida
      isLoading,         // Estado de carga
      error,             // Mensaje de error
      refreshLocation    // Función para refrescar la ubicación
    }}>
      {children}
    </LocationContext.Provider>
  );
};

// Hook personalizado para consumir el contexto de ubicación
export const useLocation = () => {
  const context = useContext(LocationContext); // Obtiene el contexto
  if (!context) {
    // Si el hook se usa fuera del proveedor, lanza error
    throw new Error('useLocation debe ser usado dentro de un LocationProvider');
  }
  return context; // Devuelve el contexto
};