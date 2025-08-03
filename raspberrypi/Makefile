CC = gcc
CFLAGS = `pkg-config --cflags glib-2.0 gio-2.0`
LIBS = `pkg-config --libs glib-2.0 gio-2.0`
TARGET = gatt_server
SRC = gatt_server.c

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC) $(LIBS)

clean:
	rm -f $(TARGET)
