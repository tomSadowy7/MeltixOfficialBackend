#include <gio/gio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const gchar introspection_xml[] =
  "<node>"
  "  <interface name='org.bluez.GattService1'>"
  "    <property name='UUID' type='s' access='read'/>"
  "    <property name='Primary' type='b' access='read'/>"
  "  </interface>"
  "  <interface name='org.bluez.GattCharacteristic1'>"
  "    <method name='WriteValue'>"
  "      <arg type='ay' name='value' direction='in'/>"
  "      <arg type='a{sv}' name='options' direction='in'/>"
  "    </method>"
  "    <property name='UUID' type='s' access='read'/>"
  "    <property name='Service' type='o' access='read'/>"
  "    <property name='Flags' type='as' access='read'/>"
  "  </interface>"
  "</node>";

static GDBusNodeInfo *introspection_data = NULL;

static const gchar *service_path = "/org/bluez/example/service0";
static const gchar *ssid_path = "/org/bluez/example/service0/ssid";
static const gchar *pass_path = "/org/bluez/example/service0/pass";

static void on_handle_write_value(GDBusConnection *conn, const gchar *sender,
                                  const gchar *object_path, const gchar *interface_name,
                                  const gchar *method_name, GVariant *parameters,
                                  GDBusMethodInvocation *invocation, gpointer user_data) {
    const gchar *label = (const gchar *)user_data;
    GVariant *value_variant;
    g_variant_get(parameters, "(@ay@a{sv})", &value_variant, NULL);

    gsize len;
    const guint8 *data = g_variant_get_fixed_array(value_variant, &len, sizeof(guint8));
    gchar *value = g_strndup((const gchar *)data, len);
    g_print("%s received: %s\n", label, value);

    g_free(value);
    g_variant_unref(value_variant);
    g_dbus_method_invocation_return_value(invocation, NULL);
}

static void on_bus_acquired(GDBusConnection *conn, const gchar *name, gpointer user_data) {
    GError *error = NULL;

    GDBusInterfaceInfo *iface_info = g_dbus_node_info_lookup_interface(introspection_data, "org.bluez.GattCharacteristic1");

    GDBusInterfaceVTable vtable_ssid = {
        .method_call = on_handle_write_value,
    };
    g_dbus_connection_register_object(conn, ssid_path, iface_info, &vtable_ssid, "WIFI_SSID", NULL, &error);

    GDBusInterfaceVTable vtable_pass = {
        .method_call = on_handle_write_value,
    };
    g_dbus_connection_register_object(conn, pass_path, iface_info, &vtable_pass, "PASSWORD_SSID", NULL, &error);

    iface_info = g_dbus_node_info_lookup_interface(introspection_data, "org.bluez.GattService1");
    g_dbus_connection_register_object(conn, service_path, iface_info, NULL, NULL, NULL, &error);

    if (error) {
        g_printerr("Error registering object: %s\n", error->message);
        g_error_free(error);
    } else {
        g_print("GATT server running and ready to receive SSID and PASSWORD\n");
    }
}

int main() {
    GError *error = NULL;
    introspection_data = g_dbus_node_info_new_for_xml(introspection_xml, &error);
    if (!introspection_data) {
        g_printerr("Unable to parse introspection XML: %s\n", error->message);
        g_error_free(error);
        return 1;
    }

    guint owner_id = g_bus_own_name(G_BUS_TYPE_SYSTEM, "org.example.GattServer",
                                    G_BUS_NAME_OWNER_FLAGS_NONE,
                                    on_bus_acquired, NULL, NULL, NULL, NULL);

    GMainLoop *loop = g_main_loop_new(NULL, FALSE);
    g_main_loop_run(loop);

    g_bus_unown_name(owner_id);
    g_dbus_node_info_unref(introspection_data);
    return 0;
}
