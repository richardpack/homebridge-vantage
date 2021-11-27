# This is a fork of https://github.com/thebeastxdxd/homebridge-vantage

# This plugin is a typescript rewrite of angeloxx's old plugin 
I didn't really add or remove (atleast I think I didn't) any features.
### Why am I doing this?
I have a vantage controller at home and I wanted to controll it from my phone. Pretty simple. Very selfish.
This means if there are features that are not used in my house I didn't not check them or give them a lot of thought.
Nfarina add some cool features which I tried to keep intact **but** they were not tested and might totaly fail.
### static plugin
I choose to leave it as a static homebridge plugin, though it shouldn't be too hard to make a dynamic version.
## Some problems I faced
The timeout between each sent command to the controller was too low, making some commands fail.
I put a pretty big timeout (also added a configurable variable) so now it takes a ton of time to 
load the plugin (depending on home much accessories you have).

I have a lot of lights in my house (around 250), and the limit for a bridge (and there for a plugin) is 149.
this is annoying. still on my TOOD list to solve this.

## Some new features
### vid mappings
The lights in my house were really badly named and I didn't want to change it everytime I reset homebridge.
in the config.json you can add `vidMapping`:
```
    {
        ...under platfrom
        "vidMapping": {
            "vid": {"Name": "hi", "Type": "fan | switch | outlet"}
        }
    }
```
Both `Name` and `Type` are optional.
The only 3 Types supported right now are: fan, switch, and outlet. Which are all basically the same thing,
the only difference is the way they show up in HomeKit.

### whitelist
this feature allows you to only add the vids you want:

```
    {
        ...under platfrom
        "whitelist": ["vid1", "vid2"]
    }
```

### How I solved the 149 accessory limit
With Homebridge v1.3.0 or later they added a feature called child bridge. [Read more here](https://github.com/homebridge/homebridge/wiki/Child-Bridges)
This lets you add plugins and platfroms in different process.
Combined with the whitelist feature you can choose the vids (accessories) you want on each child bridge.
it will look something like this:

```
    {
        "platform": "VantageInfusion",
        "name": "VantageInfusion",
        "ipaddress": "1.1.1.1",
        "_bridge": {
            "username": "00:00:00:00:00:00,
            "port": 46202
        },
        "whitelist": [
            "751"
        ]
    },
    {
        "platform": "VantageInfusion",
        "name": "VantageInfusion",
        "ipaddress": "1.1.1.1",
        "whitelist": [
            "804"
        ],
        "_bridge": {
            "username": "00:00:00:00:00:00,
            "port": 56210
        }
    }
```
*the values are fake*

## DIY
If you are interested in adding your own features or are just curious about how it works, here how:
1. You are gonna need to figure out what is the IP of your VantageControls system.
2. Open a telnet session (putty is nice) to its IP:3001 (looks like the default port for the service)
3. Type `help` it should print all of the available commands.
4. [a very useful link](https://forum.roomieremote.com/t/vantage-controls-infusion-lighting-system/1097/3)
5. Enjoy!

## TODO
1. My house didn't have the blinds configured as blinds... they were configured as normal Loads. Meaning 
   it acted like a switch, I had a VID that made the blinds go up or stop and a VID that made them go down and stop.
   But! Vantage has the option to configure Blinds, if you have a Blind type in your house you can definitely add support.
2. There is a bug when running 2 child bridges for the first time, they both try to download the configuration from vantage.
   Its a race, what I do is just wait for one of them to finish downloading the configuration and reset homebridge.
   Next time they start they will have the saved config and just read from the file.

# OLD README VantagePlugin
VantageControls InFusion plugin for homebridge: https://github.com/nfarina/homebridge

VantageControls (http://www.vantagecontrols.com/) InFusion is an High End solution that can manage:
- lighting (standard on/off/dimmed lights and RGB solutions using DMX, DALI or wireless bulb like Hue or LiFX)
- thermoregulation (with own or third party thermostats and HVAC systems)
- curtains, doors (third party)
- A/V systems (own and third party)
- security systems (third party)
- Weather stations

With this plugin you will control all systems that is already connected to Vantage without additional 
support from the manufacturer of the connected device, for example you can control an AC system without the 
HomeKit support of the specific vendor because you are already control it via InFusion's Driver that count up to 18000 
supported devices.


# Installation
Install plugin with npm install -g homebridge-vantage
Add platform within config.json of you homebridge instance:

    {
        "platforms": [{
            "platform": "VantageInfusion",
            "ipaddress": "192.168.1.1",
            "nameMapping": {
                "vid": "name"
            },
            "whitelist": ["vid1", "vid2"]
            }], 
        "bridge": {
            "username": "CC:22:3D:E3:CE:31", 
            "name": "Vantage HomeBridge Adapter", 
            "pin": "342-52-220", 
            "port": 51826
        }, 
        "description": "My Fantastic Vantage System", 
        "accessories": []
    }

Restart homebridge
Enjoy!

# Supported Devices

Currently it should be possible to control all loads registered on you InFusion device, but I'm working on the detection of the difference with Relay, Dimmer and RGB Loads; I'm ready to support Thermostats and other devices but I prefer to keep the program stable before publish further functionalities. My test plan consists of:
- RGB Philips Hue lights and Osram Lightify (controlled by Vantage, my Hue Bridge is not compatible with HomeKit and I'm happy of this)
- LiFX (controlled by Vantage)
- Legrand/BTicino MyHome Relay and Dimmer
- Legrand/BTicino MyHome Thermostat
- Youus DMX Driver

Stay tuned!

## Configuration

All supported items will automatically added to the HomeBridge device inventory; use the "Exclude from Widgets" and "Display Name" property to remove some devices or change the displayed name. 

# TODOS

- manage multiple feedbacks coming from the InFusion Controller when multiple values are sent from HomeKit
- test with standard Relay/Dimmer devices (...ehm...)

# Disclaimer

I'm furnishing this software "as is". I do not provide any warranty of the item whatsoever, whether express, implied, or statutory, including, but not limited to, any warranty of merchantability or fitness for a particular purpose or any warranty that the contents of the item will be error-free.
The development of this module is not supported by Vantage Controls or Apple. These vendors and me are not responsible for direct, indirect, incidental or consequential damages resulting from any defect, error or failure to perform.  