/* eslint-disable @typescript-eslint/no-var-requires */
import { Aedes, PublishPacket, Server } from 'aedes';
import { Db } from 'mongodb';

const mqemitter = require('mqemitter-mongodb');
const mongoPersistence = require('aedes-persistence-mongodb');

interface FlowSensor {
  rate: number;
  total: number;
  time: number;
}

enum Semaphore {
  RED = 'RED',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
}

export function startBroker(db: Db): Aedes {
  const broker = Server({
    heartbeatInterval: 60000,
    mq: mqemitter({ db }),
    persistence: mongoPersistence({ db }),
  });

  broker.on('publish', (packet, client) => {
    if (client) {
      console.log(
        '\n(publish) %s : topic %s : %s',
        client.id,
        packet.topic,
        packet.payload,
      );
      if (packet.topic === 'sensor/flow') {
        const sensor: FlowSensor = JSON.parse(packet.payload.toString());
        console.log('\npacket.payload', sensor);

        const publishPacket: PublishPacket = {
          topic: 'alert/semaphore',
          payload: 'ON',
          cmd: 'publish',
          qos: 0,
          dup: true,
          retain: true,
        };

        broker.publish(
          {
            ...publishPacket,
            topic: `sensor/airflow`,
            payload: `${sensor.rate}`,
          },
          (error) => console.log(error),
        );

        if (sensor.rate < 5) {
          broker.publish(
            { ...publishPacket, payload: Semaphore.RED },
            (error) => console.log(error),
          );
        } else if (sensor.rate < 18) {
          broker.publish(
            { ...publishPacket, payload: Semaphore.YELLOW },
            (error) => console.log(error),
          );
        } else {
          broker.publish(
            { ...publishPacket, payload: Semaphore.GREEN },
            (error) => console.log(error),
          );
        }
      }
    }
  });

  broker.on('subscribe', function (subscriptions, client) {
    console.log(
      '\n(subscribe) MQTT client \x1b[32m' +
        (client ? client.id : client) +
        '\x1b[0m subscribed to topics: ' +
        subscriptions.map((s) => s.topic).join('\n'),
      'from broker',
      broker.id,
    );

    subscriptions.map((subscription) => {
      const packet: PublishPacket = {
        topic: subscription.topic,
        payload: 'ON',
        cmd: 'publish',
        qos: subscription.qos,
        dup: true,
        retain: true,
      };
      broker.publish(packet, (error) => console.log(error));
    });
  });

  broker.on('unsubscribe', function (subscriptions, client) {
    console.log(
      '\n(unsubscribe) MQTT client \x1b[32m' +
        (client ? client.id : client) +
        '\x1b[0m unsubscribed to topics: ' +
        subscriptions.join('\n'),
      'from broker',
      broker.id,
    );
  });

  // fired when a client connects
  broker.on('client', function (client) {
    console.log(
      '\n(client) Client Connected: \x1b[33m' +
        (client ? client.id : client) +
        '\x1b[0m',
      'to broker',
      broker.id,
    );
  });

  // fired when a client disconnects
  broker.on('clientDisconnect', function (client) {
    console.log(
      '\n(clientDisconnect) Client Disconnected: \x1b[31m' +
        (client ? client.id : client) +
        '\x1b[0m',
      'to broker',
      broker.id,
    );
  });

  // fired when a message is published
  broker.on('publish', async function (packet, client) {
    console.log(
      '\n(publish) Client \x1b[31m' +
        (client ? client.id : 'BROKER_' + broker.id) +
        '\x1b[0m has published',
      packet.payload.toString(),
      'on',
      packet.topic,
      'to broker',
      broker.id,
    );
  });

  broker.on('clientError', function (error) {
    console.log(error);
  });

  return broker;
}
