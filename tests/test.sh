../contracts/build.sh

echo "\nCompilation completed\n"

export FIFTPATH=~/TON/ton/crypto/fift/lib
~/TON/build/crypto/fift -I ~/TON/ton/crypto/fift/lib -s ./tonite-test-suite.fif