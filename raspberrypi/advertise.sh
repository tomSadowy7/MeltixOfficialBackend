#!/bin/bash
bluetoothctl <<EOF
power on
agent on
default-agent
advertise on
EOF
