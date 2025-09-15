import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, StatusBar,
  TextInput, ActivityIndicator, ScrollView
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LOCATIONIQ_KEY } from './src/config';

// Haversine
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function App() {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [region, setRegion] = useState(null);
  const mapRef = useRef(null);

  // paleta
  const colors = {
    black: '#0a0908ff',
    gunmetal: '#22333bff',
    almond: '#eae0d5ff',
    khaki: '#c6ac8fff',
    walnutBrown: '#5e503fff',
  };

  // ORIGEN
  const [origin, setOrigin] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [loadingOrigin, setLoadingOrigin] = useState(false);
  const [selectingOrigin, setSelectingOrigin] = useState(false);
  const originTimeoutRef = useRef(null);
  const [originCoord, setOriginCoord] = useState(null);

  // DESTINO
  const [destination, setDestination] = useState('');
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [loadingDestination, setLoadingDestination] = useState(false);
  const destTimeoutRef = useRef(null);
  const [destinationCoord, setDestinationCoord] = useState(null);

  const [distance, setDistance] = useState(null);

  // Obtener ubicación actual
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation(location.coords);

        // reverse geocoding
        const res = await fetch(
          `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_KEY}&lat=${location.coords.latitude}&lon=${location.coords.longitude}&format=json`
        );
        const data = await res.json();
        const addr = data.display_name || 'Ubicación actual';
        setCurrentAddress(addr);

        const initialRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(initialRegion);

        // inicializar ORIGEN en ubicación actual
        setOriginCoord({
          latitude: initialRegion.latitude,
          longitude: initialRegion.longitude,
          title: addr,
        });
        setOrigin(addr);
      } catch (err) {
        console.warn('Error obteniendo ubicación:', err);
      }
    })();
  }, []);

  // fetch ORIGEN
  const fetchOriginSuggestions = useCallback((text) => {
    setOrigin(text);
    setSelectingOrigin(true);
    if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);

    if (text.trim().length < 3) {
      setOriginSuggestions([]);
      return;
    }

    originTimeoutRef.current = setTimeout(async () => {
      setLoadingOrigin(true);
      try {
        const lat = currentLocation?.latitude;
        const lon = currentLocation?.longitude;
        const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(text)}&limit=5&dedupe=1&normalizeaddress=1${lat && lon ? `&viewbox=${lon},${lat},${lon},${lat}&bounded=0` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        setOriginSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        setOriginSuggestions([]);
      } finally {
        setLoadingOrigin(false);
      }
    }, 300);
  }, [currentLocation]);

  const handleSelectOriginSuggestion = (item) => {
    setOrigin(item.display_name || '');
    setOriginSuggestions([]);
    setSelectingOrigin(false);
    if (!item.lat || !item.lon) return;

    const coord = {
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      title: item.display_name || '',
    };
    setOriginCoord(coord);

    // centrar mapa
    const newRegion = { latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(newRegion);
    if (mapRef.current) mapRef.current.animateToRegion(newRegion, 800);

    // recalcular distancia si hay destino
    if (destinationCoord) {
      const d = getDistanceFromLatLonInKm(coord.latitude, coord.longitude, destinationCoord.latitude, destinationCoord.longitude);
      setDistance(d);
    }
  };

  // fetch DESTINO
  const fetchDestinationSuggestions = useCallback((text) => {
    setDestination(text);
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);

    if (text.trim().length < 3) {
      setDestinationSuggestions([]);
      return;
    }

    destTimeoutRef.current = setTimeout(async () => {
      setLoadingDestination(true);
      try {
        const lat = currentLocation?.latitude;
        const lon = currentLocation?.longitude;
        const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(text)}&limit=5&dedupe=1&normalizeaddress=1${lat && lon ? `&viewbox=${lon},${lat},${lon},${lat}&bounded=0` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        setDestinationSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        setDestinationSuggestions([]);
      } finally {
        setLoadingDestination(false);
      }
    }, 300);
  }, [currentLocation]);

  const handleSelectDestinationSuggestion = (item) => {
    setDestination(item.display_name || '');
    setDestinationSuggestions([]);
    if (!item.lat || !item.lon) return;

    const coord = {
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      title: item.display_name || '',
    };
    setDestinationCoord(coord);

    // centrar mapa ligeramente hacia destino
    const newRegion = { latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(newRegion);
    if (mapRef.current) mapRef.current.animateToRegion(newRegion, 800);

    // calcular distancia si hay origen
    if (originCoord) {
      const d = getDistanceFromLatLonInKm(originCoord.latitude, originCoord.longitude, coord.latitude, coord.longitude);
      setDistance(d);
    }
  };

  // Usar ubicación actual (botón superior)
  const useCurrentLocationAsOrigin = () => {
    if (!currentLocation) return;
    const coord = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      title: currentAddress || 'Ubicación actual',
    };
    setOrigin(coord.title);
    setOriginCoord(coord);
    setOriginSuggestions([]);
    setSelectingOrigin(false);

    const newRegion = { latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(newRegion);
    if (mapRef.current) mapRef.current.animateToRegion(newRegion, 800);

    // recalcular distancia si hay destino
    if (destinationCoord) {
      const d = getDistanceFromLatLonInKm(coord.latitude, coord.longitude, destinationCoord.latitude, destinationCoord.longitude);
      setDistance(d);
    }
  };

  // Botón flotante para centrar en mi ubicación
  const centerOnCurrentLocation = () => {
    if (!currentLocation || !mapRef.current) {
      alert('No se pudo obtener tu ubicación actual. Activa la ubicación e intenta de nuevo.');
      return;
    }
    const newRegion = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setRegion(newRegion);
    setOriginCoord({ latitude: newRegion.latitude, longitude: newRegion.longitude, title: currentAddress || 'Ubicación actual' });
    setOrigin(currentAddress || 'Ubicación actual');
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
    setDistance(null);
    mapRef.current.animateToRegion(newRegion, 800);
  };

  return (
    <SafeAreaView style={[styles.main, { backgroundColor: colors.almond }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.almond} translucent={true} />

      {/* Header: usar ubicación actual (como en tu primer ejemplo) */}
      <TouchableOpacity
        style={{ backgroundColor: 'transparent', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginRight: 20, marginTop: 20, marginBottom: -15 }}
        onPress={useCurrentLocationAsOrigin}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="locate" size={14} color={colors.walnutBrown} style={{ marginRight: 8 }} />
          <Text style={[styles.ubicacionActual, { color: colors.gunmetal }]}>Usar ubicación actual</Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.mapaContainer, { backgroundColor: colors.almond }]}> 
        <View style={styles.mapaWrapper}> 
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.mapa}
            region={region}
            showsUserLocation
            showsMyLocationButton={false}
            showsPointsOfInterest
            mapType="standard"
          >
            {originCoord && (
              <Marker
                coordinate={{ latitude: originCoord.latitude, longitude: originCoord.longitude }}
                title={originCoord.title}
                pinColor={colors.walnutBrown}
              />
            )}

            {destinationCoord && (
              <Marker
                coordinate={{ latitude: destinationCoord.latitude, longitude: destinationCoord.longitude }}
                title={destinationCoord.title}
                pinColor={colors.khaki}
              />
            )}
          </MapView>
        </View>

        <View style={styles.arrowDown}>
          <MaterialIcons name="keyboard-arrow-down" size={32} color={colors.khaki} />
        </View>

        {/* Botón flotante para centrar ubicación actual (como lo tenías antes) */}
        <TouchableOpacity
          style={[styles.locationButton, { backgroundColor: colors.almond, borderColor: colors.walnutBrown }]}
          onPress={centerOnCurrentLocation}
        >
          <Ionicons name="locate" size={20} color={colors.gunmetal} />
        </TouchableOpacity>
      </View>

      {/* Mostrar distancia si existe */}
      {distance !== null && (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: colors.black, fontSize: 16 }}>
            Distancia: {distance < 1 ? `${Math.round(distance * 1000)} metros` : `${distance.toFixed(2)} km`}
          </Text>
        </View>
      )}

      {/* Inputs */}
      <View style={styles.searchContainer}>
        {/* ORIGEN */}
        <View style={[styles.inputContainer, { backgroundColor: colors.almond, borderColor: colors.walnutBrown }]}> 
          <Ionicons name="location" size={20} color={colors.walnutBrown} style={styles.searchIcon} />
          <TextInput
            placeholder="Origen"
            placeholderTextColor={colors.walnutBrown}
            style={[styles.input, { color: colors.black }]}
            value={origin}
            onChangeText={fetchOriginSuggestions}
            onFocus={() => setSelectingOrigin(true)}
          />
          {loadingOrigin && <ActivityIndicator size="small" color={colors.khaki} />}
        </View>

        {selectingOrigin && originSuggestions.length > 0 && (
          <ScrollView style={[styles.suggestionsContainer, { backgroundColor: colors.almond }]} keyboardShouldPersistTaps="handled">
            {originSuggestions.map((item, idx) => (
              <TouchableOpacity key={idx} style={[styles.suggestionItem, { borderBottomColor: colors.walnutBrown }]} onPress={() => handleSelectOriginSuggestion(item)}>
                <Text style={[styles.suggestionText, { color: colors.black }]}>{item.display_name || 'Sin nombre'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* DESTINO */}
        <View style={[styles.inputContainer, { backgroundColor: colors.almond, borderColor: colors.walnutBrown }]}> 
          <Ionicons name="flag" size={20} color={colors.khaki} style={styles.searchIcon} />
          <TextInput
            placeholder="¿A dónde vamos?"
            placeholderTextColor={colors.walnutBrown}
            style={[styles.input, { color: colors.black }]}
            value={destination}
            onChangeText={fetchDestinationSuggestions}
          />
          {loadingDestination && <ActivityIndicator size="small" color={colors.walnutBrown} />}
        </View>

        {destinationSuggestions.length > 0 && (
          <ScrollView style={[styles.suggestionsContainer, { backgroundColor: colors.almond }]} keyboardShouldPersistTaps="handled">
            {destinationSuggestions.map((item, idx) => (
              <TouchableOpacity key={idx} style={[styles.suggestionItem, { borderBottomColor: colors.walnutBrown }]} onPress={() => handleSelectDestinationSuggestion(item)}>
                <Text style={[styles.suggestionText, { color: colors.black }]}>{item.display_name || 'Sin nombre'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, width: '100%' },
  mapaContainer: {
    flex: 0.5,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    width: '100%'
  },
  mapaWrapper: {
    flex: 1,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden'
  },
  mapa: {
    flex: 1,
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 80
  },
  arrowDown: { alignItems: 'center', marginTop: 2 },
  searchContainer: { width: '90%', alignSelf: 'center', marginTop: 10, zIndex: 10 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 16 },
  suggestionsContainer: {
    borderRadius: 8,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
  },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  suggestionText: { fontSize: 14 },
  locationButton: {
    position: 'absolute',
    bottom: 40,
    right: 25,
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  ubicacionActual: { fontWeight: 'bold', backgroundColor: 'transparent' }
});
