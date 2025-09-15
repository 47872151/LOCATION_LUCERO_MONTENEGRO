import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Location from 'expo-location';
import LOCATIONIQ_KEY from '../src/config.js';

export const LocationContext = createContext();

export const LocationProvider = ({ children }) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Permiso de ubicación denegado');
        setCurrentAddress('Ubicación actual');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      setCurrentLocation({ latitude, longitude });
      
      // Reverse geocoding para obtener la dirección
      const response = await fetch(
        `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_KEY}&lat=${latitude}&lon=${longitude}&format=json`
      );
      const data = await response.json();
      
      if (data.display_name) {
        // Tomar solo la primera parte de la dirección
        const addressParts = data.display_name.split(',');
        setCurrentAddress(addressParts[0]);
      } else {
        setCurrentAddress('Ubicación actual');
      }
    } catch (error) {
      console.error('Error obteniendo ubicación:', error);
      setError('Error obteniendo ubicación');
      setCurrentAddress('Ubicación actual');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshLocation = () => {
    getCurrentLocation();
  };

  return (
    <LocationContext.Provider value={{
      currentLocation,
      currentAddress,
      isLoading,
      error,
      refreshLocation
    }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation debe ser usado dentro de un LocationProvider');
  }
  return context;
}; 