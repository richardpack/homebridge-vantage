import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
} from "homebridge";

import { VantageInfusionController } from "./vantage-infusion-controller";

export class VantageDimmer implements AccessoryPlugin {

  private readonly log: Logging;
  private hap: HAP;

  private vid: string;
  private controller: VantageInfusionController;
  private lightOn = false;
  private brightness: number;
  private saturation: number;
  private hue: number;
  private loadType: string;
  private dimmerRequestTimer: any;

  // This property must be existent!!
  name: string;

  private readonly lightService: Service;
  private readonly informationService: Service;

  // TODO: dont need loadType, but because of rgb it is kept.
  constructor(hap: HAP, log: Logging, name: string, vid: string, controller: VantageInfusionController, loadType: string) {
    this.log = log;
    this.hap = hap;
    this.name = name;
    this.vid = vid;
    this.controller = controller;
    this.brightness = 100;
    this.saturation = 0;
    this.hue = 0;
    this.loadType = loadType;
    this.dimmerRequestTimer = undefined;

    this.lightService = new hap.Service.Lightbulb(name);
    this.addLightService();

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Vantage Controls")
      .setCharacteristic(hap.Characteristic.Model, "Power Switch Dimmer")
      .setCharacteristic(hap.Characteristic.SerialNumber, `VID ${this.vid}`);

    // get the current state
    this.controller.sendGetLoadStatus(this.vid);
  }

  addLightService() {
    this.lightService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`Dimmer ${this.name} get state: ${this.lightOn ? "ON" : "OFF"}`);
        callback(undefined, this.lightOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`Dimmer ${this.name} set state: ${value ? "ON" : "OFF"}`);
        this.lightOn = value as boolean;
        callback();
      });

    if (this.loadType == "dimmer" || this.loadType == "rgb") {
      this.addDimmerLightService();
    }

    if (this.loadType == "rgb") {
      this.addRGBLightService();
    }
  }

  dispatchDimmerRequest() {
    this.dimmerRequestTimer = setTimeout(() => {
      this.controller.sendLoadDim(this.vid, this.lightOn ? this.brightness : 0);
      this.dimmerRequestTimer = undefined;
    }, 50);
  }

  /*
   * adds dimmer control to light service
   */
  addDimmerLightService() {
    this.lightService.getCharacteristic(this.hap.Characteristic.Brightness)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.log.debug(`Dimmer ${this.name} get brightness state: ${this.brightness}`);
        callback(undefined, this.brightness);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.debug(`Dimmer ${this.name} set brightness state: ${value}`);
        this.brightness = value as number;
        this.lightOn = this.brightness > 0 ? true : false;

        if (this.dimmerRequestTimer == undefined) {
          this.dispatchDimmerRequest();

        } else {
          clearTimeout(this.dimmerRequestTimer);
          this.dispatchDimmerRequest();
        }

        callback();
      });
  }

  /*
   * adds RGB control to light service
   * NOTE: this was not checked! Probably doesnt work
   */
  addRGBLightService() {
    this.lightService.getCharacteristic(this.hap.Characteristic.Saturation)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.saturation);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.lightOn = true;
        this.saturation = value as number;
        this.controller.sendRGBLoadDissolveHSL(this.vid, this.hue, this.saturation, this.brightness);
        callback();
      });

    this.lightService.getCharacteristic(this.hap.Characteristic.Hue)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.hue);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.lightOn = true;
        this.hue = value as number;
        this.controller.sendRGBLoadDissolveHSL(this.vid, this.hue, this.saturation, this.brightness);
        callback();
      });
  }


  /*
   * this is called by the platfrom, whenever a loadStatusChange occures for this vid.
   * NOTE: When changing the value vai home we send a command to the VantageController. 
   *       This will return a loadStatusChange, but we already changed the values, meaning the same value change happens twice.
   *       This is ineffiecent but shouldn't make any problems. We do this so we can remove the delay when using home.
   */
  loadStatusChange(value: number) {
    this.log.debug(`Dimmer loadStatusChange (VID=${this.vid}, Name=${this.name}, Bri=${value}`);
    this.brightness = value;
    this.lightOn = (this.brightness > 0);

    this.lightService.getCharacteristic(this.hap.Characteristic.On).updateValue(this.lightOn);

    if (this.loadType == "rgb" || this.loadType == "dimmer") {
      this.lightService.getCharacteristic(this.hap.Characteristic.Brightness).updateValue(this.brightness);
    }
  }


  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log.info("Identify!");
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.lightService,
    ];
  }

}