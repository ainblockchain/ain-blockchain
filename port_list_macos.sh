#!/bin/bash

# Gets a list of the system port numbers in use for MacOS
sudo lsof -i -P -n | grep LISTEN
