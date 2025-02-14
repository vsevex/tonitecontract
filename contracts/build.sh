#!/bin/bash

~/TON/build/crypto/func -SPA -R -o ../build/tonite.fif ~/TON/ton/crypto/smartcont/stdlib.fc ./tonite.fc

# copy and change for test
cp ../build/tonite.fif ../build/tonite-test.fif
sed '$d' ../build/tonite-test.fif > test.fif
rm ../build/tonite-test.fif
mv test.fif ../build/tonite-test.fif
echo -n "}END>s constant code" >> ../build/tonite-test.fif