import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, StatusBar,
  TextInput, ActivityIndicator, ScrollView
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LOCATIONIQ_KEY } from './src/config'; // 🔑 API Key de LocationIQ


// Fórmula de Haversine para calcular la distancia entre 2 puntos geográficos
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // devuelve la distancia en kilómetros
}

export default function App() {
  const [currentLocation, setCurrentLocation] = useState(null); // ubicación actual (lat/lon)
  const [currentAddress, setCurrentAddress] = useState(null);   // dirección en texto
  const [region, setRegion] = useState(null);                   // región visible del mapa
  const mapRef = useRef(null);                                  // referencia al mapa (para mover cámara)

  // Paleta de colores de la app
  const colors = {
    black: '#0a0908ff',
    gunmetal: '#22333bff',
    almond: '#eae0d5ff',
    khaki: '#c6ac8fff',
    walnutBrown: '#5e503fff',
  };

  // ---------------------- ESTADOS DE ORIGEN ----------------------
  const [origin, setOrigin] = useState('');                        // texto escrito en input de origen
  const [originSuggestions, setOriginSuggestions] = useState([]);  // sugerencias de direcciones
  const [loadingOrigin, setLoadingOrigin] = useState(false);       // loader mientras busca sugerencias
  const [selectingOrigin, setSelectingOrigin] = useState(false);   // si el usuario está eligiendo origen
  const originTimeoutRef = useRef(null);                           // referencia para timeout (debounce)
  const [originCoord, setOriginCoord] = useState(null);            // coordenadas del origen seleccionado

  // ---------------------- ESTADOS DE DESTINO ----------------------
  const [destination, setDestination] = useState('');                      // texto en input destino
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);// sugerencias destino
  const [loadingDestination, setLoadingDestination] = useState(false);     // loader destino
  const destTimeoutRef = useRef(null);                                     // timeout (debounce)
  const [destinationCoord, setDestinationCoord] = useState(null);          // coordenadas destino

  // ---------------------- ESTADO DE DISTANCIA ----------------------
  const [distance, setDistance] = useState(null); // distancia calculada entre origen y destino

  // ---------------------- EFECTO: UBICACIÓN ACTUAL ----------------------
  useEffect(() => {
    (async () => {
      try {
        // pedir permisos de ubicación
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        // obtener coordenadas
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation(location.coords);

        // obtener dirección en texto con reverse geocoding
        const res = await fetch(
          `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_KEY}&lat=${location.coords.latitude}&lon=${location.coords.longitude}&format=json`
        );
        const data = await res.json();
        const addr = data.display_name || 'Ubicación actual';
        setCurrentAddress(addr);

        // región inicial del mapa
        const initialRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(initialRegion);

        // setear el origen como la ubicación actual
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

  // ---------------------- FETCH SUGERENCIAS ORIGEN ----------------------
  const fetchOriginSuggestions = useCallback((text) => {
    setOrigin(text);
    setSelectingOrigin(true);
    if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);

    // si escribe menos de 3 caracteres, no busca
    if (text.trim().length < 3) {
      setOriginSuggestions([]);
      return;
    }

    // debounce: espera 300ms antes de consultar API
    originTimeoutRef.current = setTimeout(async () => {
      setLoadingOrigin(true);
      try {
        const lat = currentLocation?.latitude;
        const lon = currentLocation?.longitude;
        // consulta a la API de LocationIQ para autocompletar
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

  // Seleccionar una sugerencia como ORIGEN
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

    // centrar mapa en nuevo origen
    const newRegion = { latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(newRegion);
    if (mapRef.current) mapRef.current.animateToRegion(newRegion, 800);

    // recalcular distancia si ya hay destino
    if (destinationCoord) {
      const d = getDistanceFromLatLonInKm(coord.latitude, coord.longitude, destinationCoord.latitude, destinationCoord.longitude);
      setDistance(d);
    }
  };

  // ---------------------- FETCH SUGERENCIAS DESTINO ----------------------
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

  // Seleccionar sugerencia como DESTINO
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

    // centrar mapa en destino
    const newRegion = { latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(newRegion);
    if (mapRef.current) mapRef.current.animateToRegion(newRegion, 800);

    // calcular distancia si ya hay origen
    if (originCoord) {
      const d = getDistanceFromLatLonInKm(originCoord.latitude, originCoord.longitude, coord.latitude, coord.longitude);
      setDistance(d);
    }
  };

  // ---------------------- USAR UBICACIÓN ACTUAL COMO ORIGEN ----------------------
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

    if (destinationCoord) {
      const d = getDistanceFromLatLonInKm(coord.latitude, coord.longitude, destinationCoord.latitude, destinationCoord.longitude);
      setDistance(d);
    }
  };

  // ---------------------- BOTÓN FLOTE PARA CENTRAR EN UBICACIÓN ----------------------
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

      {/* Header con opción para usar ubicación actual */}
      <TouchableOpacity
        style={{ backgroundColor: 'transparent', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginRight: 20, marginTop: 20, marginBottom: -15 }}
        onPress={useCurrentLocationAsOrigin}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="locate" size={14} color={colors.walnutBrown} style={{ marginRight: 8 }} />
          <Text style={[styles.ubicacionActual, { color: colors.gunmetal }]}>Usar ubicación actual</Text>
        </View>
      </TouchableOpacity>

      {/* Mapa con markers */}
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
            {/* Marker origen */}
            {originCoord && (
              <Marker
                coordinate={{ latitude: originCoord.latitude, longitude: originCoord.longitude }}
                title={originCoord.title}
                pinColor={colors.walnutBrown}
              />
            )}

            {/* Marker destino */}
            {destinationCoord && (
              <Marker
                coordinate={{ latitude: destinationCoord.latitude, longitude: destinationCoord.longitude }}
                title={destinationCoord.title}
                pinColor={colors.khaki}
              />
            )}
          </MapView>
        </View>

        {/* Flecha decorativa */}
        <View style={styles.arrowDown}>
          <MaterialIcons name="keyboard-arrow-down" size={32} color={colors.khaki} />
        </View>

        {/* Botón flotante para volver a ubicación actual */}
        <TouchableOpacity
          style={[styles.locationButton, { backgroundColor: colors.almond, borderColor: colors.walnutBrown }]}
          onPress={centerOnCurrentLocation}
        >
          <Ionicons name="locate" size={20} color={colors.gunmetal} />
        </TouchableOpacity>
      </View>

      {/* Distancia entre origen y destino */}
      {distance !== null && (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: colors.black, fontSize: 16 }}>
            Distancia: {distance < 1 ? `${Math.round(distance * 1000)} metros` : `${distance.toFixed(2)} km`}
          </Text>
        </View>
      )}

      {/* Inputs de búsqueda */}
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

        {/* Lista de sugerencias origen */}
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

        {/* Lista de sugerencias destino */}
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

// ---------------------- ESTILOS ----------------------
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
    shadowOpacity: 0.
