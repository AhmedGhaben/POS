#!/bin/bash
# Runs inside a D-Bus session with an unlocked gnome-keyring (stand-in for Windows DPAPI).
eval "$(echo -n storbit | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)"
eval "$(gnome-keyring-daemon --start --components=secrets 2>/dev/null)"
export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
export XDG_CURRENT_DESKTOP=GNOME
exec "$@"
