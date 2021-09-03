#!/bin/bash

echo 'Starting up Prometheus..'
cd prometheus

nohup ./prometheus --config.file=prometheus.yml >logs.txt 2>&1 &
echo "Prometheus is now up!"

cd ..


echo 'Starting up Grafana..'
sudo systemctl daemon-reload
sudo systemctl start grafana-server
sudo systemctl status grafana-server
echo "Grafana is now up!"
