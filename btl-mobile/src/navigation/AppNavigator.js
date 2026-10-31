// src/navigation/AppNavigator.js
import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../utils/theme';

import HomePageScreen from '../screens/Auth/HomePageScreen';
import AdminDashboard from '../screens/Admin/AdminDashboard';
import OwnerDashboard from '../screens/Owner/OwnerDashboard';
import ClientDashboard from '../screens/Client/ClientDashboard';
import ExecutiveDashboard from '../screens/Executive/ExecutiveDashboard';
import ServiceDetailsScreen from '../screens/Shared/ServiceDetailsScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loadingText}>Loading BTL Manager...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={HomePageScreen} />
        ) : (
          <>
            {user.role === 'admin' ? (
              <Stack.Screen name="AdminHome" component={AdminDashboard} />
            ) : user.role === 'owner' ? (
              <Stack.Screen name="OwnerHome" component={OwnerDashboard} />
            ) : user.role === 'client' ? (
              <Stack.Screen name="ClientHome" component={ClientDashboard} />
            ) : (
              <Stack.Screen name="ExecutiveHome" component={ExecutiveDashboard} />
            )}
            <Stack.Screen name="ServiceDetails" component={ServiceDetailsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
});
