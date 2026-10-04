#!/usr/bin/env python3
"""Asks the home router, over UPnP, to forward a TCP port to this machine.

Routers forget UPnP mappings when they reboot and this machine's LAN address can
change with DHCP, so cron runs this every 15 minutes to put the mapping back.
Usage: upnp-forward.py [port]    (default 8787). Prints the public address.
"""
import re
import socket
import sys
import urllib.request
from urllib.parse import urljoin

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
SERVICES = ("urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANPPPConnection:1")


def discover() -> str:
    request = "\r\n".join([
        "M-SEARCH * HTTP/1.1", "HOST: 239.255.255.250:1900", 'MAN: "ssdp:discover"', "MX: 2",
        "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1", "", "",
    ]).encode()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(4)
    sock.sendto(request, ("239.255.255.250", 1900))
    data, _ = sock.recvfrom(4096)
    match = re.search(r"^location:\s*(\S+)", data.decode(errors="ignore"), re.I | re.M)
    if not match:
        raise SystemExit("router answered without a description URL")
    return match.group(1)


def control_url(location: str) -> tuple[str, str]:
    description = urllib.request.urlopen(location, timeout=5).read().decode(errors="ignore")
    for block in re.findall(r"<service>(.*?)</service>", description, re.S):
        kind = re.search(r"<serviceType>(.*?)</serviceType>", block)
        url = re.search(r"<controlURL>(.*?)</controlURL>", block)
        if kind and url and kind.group(1).strip() in SERVICES:
            return urljoin(location, url.group(1).strip()), kind.group(1).strip()
    raise SystemExit("router exposes no WAN connection service")


def soap(url: str, service: str, action: str, args: dict) -> str:
    body = "".join(f"<{k}>{v}</{k}>" for k, v in args.items())
    envelope = (
        '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>'
        f'<u:{action} xmlns:u="{service}">{body}</u:{action}></s:Body></s:Envelope>'
    ).encode()
    request = urllib.request.Request(url, envelope, {
        "Content-Type": 'text/xml; charset="utf-8"', "SOAPAction": f'"{service}#{action}"',
    })
    return urllib.request.urlopen(request, timeout=5).read().decode(errors="ignore")


def lan_address(router_host: str) -> str:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe.connect((router_host, 9))
    return probe.getsockname()[0]


location = discover()
url, service = control_url(location)
local = lan_address(re.match(r"https?://([^:/]+)", location).group(1))
external = re.search(r"<NewExternalIPAddress>(.*?)<", soap(url, service, "GetExternalIPAddress", {}))
soap(url, service, "AddPortMapping", {
    "NewRemoteHost": "", "NewExternalPort": PORT, "NewProtocol": "TCP", "NewInternalPort": PORT,
    "NewInternalClient": local, "NewEnabled": 1, "NewPortMappingDescription": "melodle",
    "NewLeaseDuration": 0,
})
print(f"forwarding {external.group(1) if external else '?'}:{PORT} -> {local}:{PORT}")
