// Place this in /home/admin/ble-wifi/ble_wifi_gatt_server.c

#include <gio/gio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "gatt-server.h"  // Provided by BlueZ examples (bluez/test/example-gatt-server)

#define SERVICE_UUID        "12341000-1234-1234-1234-123456789abc"
#define SSID_UUID           "12341001-1234-1234-1234-123456789abc"
#define PASSWORD_UUID       "12341002-1234-1234-1234-123456789abc"
#define STATUS_UUID         "12341003-1234-1234-1234-123456789abc"

static GDBusConnection *connection;
static char wifi_ssid[128] = {0};
static char wifi_password[128] = {0};
static GDBusInterfaceSkeleton *status_char = NULL;

static void try_connect_wifi() {
    if (strlen(wifi_ssid) == 0 || strlen(wifi_password) == 0) return;

    printf("Attempting to connect to SSID: %s\n", wifi_ssid);
    char command[512];
    snprintf(command, sizeof(command),
             "/home/admin/ble-wifi/wifi_connect.sh '%s' '%s'",
             wifi_ssid, wifi_password);

    int result = system(command);
    const char *status = result == 0 ? "SUCCESS" : "FAILURE";

    if (status_char) {
        GVariant *value = g_variant_new_fixed_array(G_VARIANT_TYPE_BYTE, status, strlen(status), sizeof(char));
        g_dbus_interface_skeleton_emit_property_changed(status_char, "org.bluez.GattCharacteristic1", "Value", value);
    }

    memset(wifi_ssid, 0, sizeof(wifi_ssid));
    memset(wifi_password, 0, sizeof(wifi_password));
}

static void on_write_ssid(GDBusMethodInvocation *invocation, GVariant *value) {
    gsize len = 0;
    const guint8 *data = g_variant_get_fixed_array(value, &len, sizeof(guint8));
    strncpy(wifi_ssid, (const char *)data, sizeof(wifi_ssid)-1);
    printf("Received SSID: %s\n", wifi_ssid);
    try_connect_wifi();
}

static void on_write_password(GDBusMethodInvocation *invocation, GVariant *value) {
    gsize len = 0;
    const guint8 *data = g_variant_get_fixed_array(value, &len, sizeof(guint8));
    strncpy(wifi_password, (const char *)data, sizeof(wifi_password)-1);
    printf("Received Password: %s\n", wifi_password);
    try_connect_wifi();
}

int main(int argc, char *argv[]) {
    GMainLoop *loop = g_main_loop_new(NULL, FALSE);

    connection = g_bus_get_sync(G_BUS_TYPE_SYSTEM, NULL, NULL);

    GattService *service = gatt_service_new(SERVICE_UUID, TRUE);

    GattCharacteristic *ssid_char = gatt_characteristic_new(SSID_UUID, "write");
    g_signal_connect(ssid_char, "handle-write-value", G_CALLBACK(on_write_ssid), NULL);

    GattCharacteristic *password_char = gatt_characteristic_new(PASSWORD_UUID, "write");
    g_signal_connect(password_char, "handle-write-value", G_CALLBACK(on_write_password), NULL);

    GattCharacteristic *status = gatt_characteristic_new(STATUS_UUID, "notify");
    status_char = G_DBUS_INTERFACE_SKELETON(status);

    gatt_service_add_characteristic(service, ssid_char);
    gatt_service_add_characteristic(service, password_char);
    gatt_service_add_characteristic(service, status);

    gatt_manager_register_service(connection, service);

    printf("BLE Wi-Fi Configurator running...\n");
    g_main_loop_run(loop);
    return 0;
}
