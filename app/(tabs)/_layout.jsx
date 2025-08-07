import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: true,
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.white,

        tabBarStyle: {
          height: 60,
          paddingBottom: 5,
          paddingTop: 5,
          position: "absolute",
          elevation: 0,
          backgroundColor: COLORS.black,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: () => (
            <Ionicons name="home" size={30} color={COLORS.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          tabBarIcon: () => (
            <Ionicons name="bookmark" size={30} color={COLORS.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarIcon: () => (
            <Ionicons name="add" size={30} color={COLORS.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="notification"
        options={{
          tabBarIcon: () => (
            <Ionicons name="notifications" size={30} color={COLORS.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: () => (
            <Ionicons name="person" size={30} color={COLORS.primary} />
          ),
        }}
      />
    </Tabs>
  );
}
