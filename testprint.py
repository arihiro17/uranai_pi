import argparse
import io
import serial
from datetime import datetime

ser = serial.Serial("/dev/ttyAMA0", baudrate = 9600, timeout = 2)

ser.write("\r（内うるさい度　　　　100）\r\r\r")