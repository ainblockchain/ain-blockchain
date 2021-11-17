#!/bin/bash

printf "\n[[[[[ start_monitoring_gcp.sh ]]]]]\n\n"

printf 'Starting up Prometheus..\n'
cd prometheus

nohup ./prometheus --config.file=prometheus.yml >logs.txt 2>&1 &
printf "Prometheus is now up!\n"

cd ..


printf 'Starting up Grafana..\n'
sudo systemctl daemon-reload
sudo systemctl start grafana-server
sudo systemctl status grafana-server
printf "Grafana is now up!\n"
