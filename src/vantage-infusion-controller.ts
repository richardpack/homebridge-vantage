import * as net from 'net';
import * as fs from 'fs';
import * as xml2json from 'xml2json';
import * as libxmljs from 'libxmljs';
import * as sleep from 'sleep';
import {
  Logging,
} from "homebridge";
import { EventEmitter } from 'events';

const serverControllerPort = 3001;
const serverConfigurationPort = 2001;

const configurationPath = '/tmp/vantage.dc';

export const LoadStatusChangeEvent = "loadStatusChange";
export const ThermostatOutdoorTemperatureChangeEvent = "thermostatOutdoorTemperatureChange";
export const ThermostatIndoorTemperatureChangeEvent = "thermostatIndoorTemperatureChange";
export const IsInterfaceSupportedEvent = (vid: string, interfaceId: string) => `isInterfaceSupportedAnswer-${vid}-${interfaceId}`;
export const EndDownloadConfigurationEvent = "endDownloadConfiguration";


export class VantageInfusionController extends EventEmitter {

  private readonly log: Logging;
  private readonly ipaddress: string;
  private readonly controllerSendInterval: number;
  private serverDatabase: string;
  private interfaces: Record<string, any>;
  private serverController: net.Socket;
  private serverConfiguration: net.Socket;

  constructor(log: Logging, ipaddress: string, controllerSendInterval: number = 50000) {
    super();
    this.log = log;
    this.ipaddress = ipaddress;
    this.controllerSendInterval = controllerSendInterval;
    this.serverDatabase = "";
    this.interfaces = {};
    this.serverController = new net.Socket();
    this.serverController.setEncoding("ascii");
    this.serverConfiguration = new net.Socket();
    this.serverController.on('data', this.serverControllerDataCallback.bind(this));
    this.serverConfiguration.on('data', this.serverConfigurationDataCallback.bind(this));
    this.log.info("Connecting to VantageInfusion Controller at ", ipaddress);
    this.serverControllerConnect();
  }

  /**
   * Start the command session. The InFusion controller (starting from the 3.2 version of the
   * firmware) must be configured without encryption or password protection. Support to SSL
   * and password protected connection will be introduced in the future, the IoT world is
   * a bad place! 
   */
  serverControllerConnect() {
    // data callback should already be initialized
    this.serverController.connect({ host: this.ipaddress, port: serverControllerPort }, () => {
      this.sendControllerMessage("STATUS ALL\n");
      this.sendControllerMessage("ELENABLE 1 AUTOMATION ON\nELENABLE 1 EVENT ON\nELENABLE 1 STATUS ON\nELENABLE 1 STATUSEX ON\nELENABLE 1 SYSTEM ON\nELLOG AUTOMATION ON\nELLOG EVENT ON\nELLOG STATUS ON\nELLOG STATUSEX ON\nELLOG SYSTEM ON\n");

    });
  }

  /**
   * Start the discovery procedure that use the local cache or download from the InFusion controller
   * the last configuration saved on the SD card (usually the developer save a backup copy of the configuration
   * on this support but in some cases it can be different from the current running configuration, I need to
   * check how to download it with a single pass procedure)
  */
  serverConfigurationDownload() {
    // data callback should already be initialized
    this.serverConfiguration.connect({ host: this.ipaddress, port: serverConfigurationPort }, () => {
      // Aehm, async method becomes sync...
      this.sendGetInterfaces();
      this.sendDownloadConfiguration();
    });
  }

  serverControllerDataCallback(data: Buffer) {

    this.log.debug(data.toString());

    const lines = data.toString().split('\n');

    lines.forEach((line) => {
      const command = line.split(' ');

      if (line.startsWith("S:LOAD ") || line.startsWith("R:GETLOAD ")) {
        const vid = parseInt(command[1]);
        const value = parseInt(command[2]);
        // live update about load change (even if it's an RGB load)
        this.emit(LoadStatusChangeEvent, vid, value);
      }

      // outdoor temperature
      if (line.startsWith("EL: ") && command[3] == "Thermostat.SetOutdoorTemperatureSW") {
        const vid = parseInt(command[2]);
        const value = parseFloat(command[4]) / 1000;
        this.emit(ThermostatOutdoorTemperatureChangeEvent, vid, value);
      }

      if (line.startsWith("R:INVOKE") && command[3] == "Thermostat.GetOutdoorTemperature") {
        const vid = parseInt(command[1]);
        const value = parseFloat(command[2])
        this.emit(ThermostatOutdoorTemperatureChangeEvent, vid, value);
      }

      // indoor temperature
      if (line.startsWith("EL: ") && command[3] == "Thermostat.SetIndoorTemperatureSW") {
        const vid = parseInt(command[2]);
        const value = parseFloat(command[4]) / 1000;
        this.emit(ThermostatIndoorTemperatureChangeEvent, vid, value);
      }

      // Non-state feedback
      if (line.startsWith("R:INVOKE") && line.includes("Object.IsInterfaceSupported")) {
        const support = parseInt(command[2]);
        this.emit(IsInterfaceSupportedEvent(command[1].trim(), command[4].trim()), support);
      }
    });
  }
  /**
   * List interfaces, list configuration and then check if a specific interface 
   * is supported by the recognized devices. 
   */
  serverConfigurationDataCallback(data: Buffer) {
    this.serverDatabase = this.serverDatabase + data.toString().replace("\ufeff", "");

    try {
      this.serverDatabase = this.serverDatabase.replace('<?File Encode="Base64" /', '<File>');
      this.serverDatabase = this.serverDatabase.replace('?>', '</File>');
      // try to parse the xml we got so far
      libxmljs.parseXml(this.serverDatabase);
      this.log.info("was able to parse xml");
    } catch (error) {
      return false;
    }

    const parsedDatabase = JSON.parse(xml2json.toJson(this.serverDatabase));
    this.parseInterfaces(parsedDatabase);
    this.parseConfigurationDatabase(parsedDatabase);
    this.serverDatabase = "";
  }

  sendControllerMessage(msg: string) {
    sleep.usleep(this.controllerSendInterval);
    this.log.info("writing message to controller: " + msg);
    this.serverController.write(msg, "ascii");
  }

  sendGetLoadStatus(vid: string): void {
    this.sendControllerMessage(`GETLOAD ${vid}\n`);
  }

  /**
   * Send the set HSL color request to the controller
   * 
   * NOTE: this function was not tested.
  */
  sendRGBLoadDissolveHSL(vid: string, h: number, s: number, l: number, time?: number): void {
    const thisTime = time || 500;
    this.sendControllerMessage(`INVOKE ${vid} RGBLoad.DissolveHSL ${h} ${s} ${l * 1000} ${thisTime}\n`);
  }

  /**
   * NOTE: this function was not tested.
  */
  sendThermostatGetOutdoorTemperature(vid: string): void {
    this.sendControllerMessage(`INVOKE ${vid} Thermostat.GetOutdoorTemperature\n`);
  }

  /**
   * Send the set light level to the controller
  */
  sendLoadDim(vid: string, level: number, time?: number): void {
    // TODO: reduce feedback (or command) rate
    const thisTime = time || 1;
    if (level > 0) {
      this.sendControllerMessage(`INVOKE ${vid} Load.Ramp 6 ${thisTime} ${level}\n`);
    } else {
      this.sendControllerMessage(`INVOKE ${vid} Load.SetLevel ${level}\n`);
    }
  }

  sendIsInterfaceSupported(vid: string, interfaceId: string): void {
    this.sendControllerMessage(`INVOKE ${vid} Object.IsInterfaceSupported ${interfaceId}\n`);
  }

  isInterfaceSupported(item: any, interfaceName: string): Promise<{ item: any, interface: string, support: boolean }> {

    if (this.interfaces[interfaceName] === undefined) {
      return Promise.resolve({ item, interface: interfaceName, support: false });
    } else {
      /**
       * Sample
       *   OUT| INVOKE 2774 Object.IsInterfaceSupported 32
       *    IN| R:INVOKE 2774 0 Object.IsInterfaceSupported 32
       */
      const interfaceId = this.interfaces[interfaceName];

      return new Promise((resolve) => {
        this.once(IsInterfaceSupportedEvent(item.VID.trim(), interfaceId.trim()), (support) => resolve({ item, interface: interfaceName, support }));
        this.sendIsInterfaceSupported(item.VID, interfaceId);
      });
    }
  }

  sendGetInterfaces() {
    this.serverConfiguration.write("<IIntrospection><GetInterfaces><call></call></GetInterfaces></IIntrospection>\n", "ascii");
  }

  sendDownloadConfiguration() {
    if (!fs.existsSync(configurationPath)) {
      this.log.debug("sending configuration download");
      this.serverConfiguration.write("<IBackup><GetFile><call>Backup\\Project.dc</call></GetFile></IBackup>\n", "ascii");
    }
  }

  parseInterfaces(database: any) {
    if (database.IIntrospection !== undefined) {
      this.log.debug("parsing interfaces");
      let databaseInterfaces = database.IIntrospection.GetInterfaces.return.Interface;
      databaseInterfaces.forEach((tmpInterface: any) => {
        this.log.debug(`interface ${tmpInterface.Name} ID ${tmpInterface.IID}`);
        this.interfaces[tmpInterface.Name] = tmpInterface.IID;
      });
    }
  }

  parseConfigurationDatabase(database: any) {
    if (database.IBackup !== undefined) {
      this.log.debug("parsing configuration");
      const configuration = Buffer.from(database.IBackup.GetFile.return.File, 'base64').toString("ascii");
      fs.writeFileSync(configurationPath, configuration);
      this.emit(EndDownloadConfigurationEvent, configuration);
    } else {
      this.log.debug("reading configuration from file");
      fs.readFile(configurationPath, 'utf8', (err, data) => {
        if (!err) {
          this.emit(EndDownloadConfigurationEvent, data);
        } else {
          this.log.info("database file does not exist");
        }
      })
    }
  }
}