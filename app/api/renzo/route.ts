import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const RPC_URL = "https://rpc.mevblocker.io";

// Contract addresses
const CONTRACTS = {
  RESTAKE_MANAGER: "0x74a09653A083691711cF8215a6ab074BB4e99ef5",
  EZETH_TOKEN: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
  DEPOSIT_QUEUE: "0xf2F305D14DCD8aaef887E0428B3c9534795D0d60",
  WITHDRAW_QUEUE: "0x5efc9D10E42FB517456f4ac41EB5e2eBe42C8918",
  BALANCE_RATE_PROVIDER: "0x387dBc0fB00b26fb085aa658527D5BE98302c84C",
};

// Operator Delegators
const OPERATORS = [
  { name: "Figment", od: "0x78524bEeAc12368e600457478738c233f436e9f6", pod: "0x35Cb1491dCf4C0AB6b413AfC42298e32f13FF524" },
  { name: "P2P.org", od: "0x125B367C16C5858f11e12948404F7a1371a0FDa3", pod: "0xd4018Ce9A041a9c110A9d0383d2b5E1c66Ae1513" },
  { name: "Luganodes", od: "0x0B1981a9Fcc24A445dE15141390d3E46DA0e425c", pod: "0x093f6C270aC22EC240f0C6fd7414Ea774ca8d3e5" },
  { name: "HashKey Cloud", od: "0xbaf5f3a05bd7af6f3a0bba207803bf77e2657c8f", pod: "0x2641C2ded63a0C640629F5eDF1189e0f53C06561" },
  { name: "Pier Two", od: "0x38cDB1A8207264C1A07c42c43A4c3ED4bfab7CEA", pod: "0xDD0212d0da33a2235d1952dA390a0A18EAcc7af5" },
];

// ABIs (minimal)
const ERC20_ABI = ["function totalSupply() view returns (uint256)"];
const RATE_PROVIDER_ABI = ["function getRate() view returns (uint256)"];
const RESTAKE_MANAGER_ABI = [
  "function calculateTVLs() view returns (uint256[][] memory, uint256[] memory, uint256)",
  "function paused() view returns (bool)",
];
const WITHDRAW_QUEUE_ABI = [
  "function coolDownPeriod() view returns (uint256)",
  "function withdrawRequestNonce() view returns (uint256)",
];
const EIGENPOD_ABI = [
  "function withdrawableRestakedExecutionLayerGwei() view returns (uint64)",
];

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Create contract instances
    const ezETH = new ethers.Contract(CONTRACTS.EZETH_TOKEN, ERC20_ABI, provider);
    const rateProvider = new ethers.Contract(CONTRACTS.BALANCE_RATE_PROVIDER, RATE_PROVIDER_ABI, provider);
    const restakeManager = new ethers.Contract(CONTRACTS.RESTAKE_MANAGER, RESTAKE_MANAGER_ABI, provider);
    const withdrawQueue = new ethers.Contract(CONTRACTS.WITHDRAW_QUEUE, WITHDRAW_QUEUE_ABI, provider);

    // Fetch core data in parallel
    const [
      totalSupply,
      exchangeRate,
      tvlData,
      isPaused,
      depositQueueBalance,
      withdrawQueueBalance,
      coolDownPeriod,
      withdrawNonce,
    ] = await Promise.all([
      ezETH.totalSupply(),
      rateProvider.getRate(),
      restakeManager.calculateTVLs(),
      restakeManager.paused(),
      provider.getBalance(CONTRACTS.DEPOSIT_QUEUE),
      provider.getBalance(CONTRACTS.WITHDRAW_QUEUE),
      withdrawQueue.coolDownPeriod(),
      withdrawQueue.withdrawRequestNonce(),
    ]);

    // Fetch operator data
    const operatorData = await Promise.all(
      OPERATORS.map(async (op) => {
        const podBalance = await provider.getBalance(op.pod);
        
        // Try to get withdrawable execution layer rewards
        let withdrawableGwei = BigInt(0);
        try {
          const eigenPod = new ethers.Contract(op.pod, EIGENPOD_ABI, provider);
          withdrawableGwei = await eigenPod.withdrawableRestakedExecutionLayerGwei();
        } catch {
          // Some pods might not have this function
        }
        
        return {
          name: op.name,
          odAddress: op.od,
          podAddress: op.pod,
          podBalance: ethers.formatEther(podBalance),
          withdrawableExecutionLayer: Number(withdrawableGwei) * 1e9 / 1e18,
        };
      })
    );

    const totalTVL = tvlData[2];
    const totalSupplyFormatted = parseFloat(ethers.formatEther(totalSupply));
    const totalTVLFormatted = parseFloat(ethers.formatEther(totalTVL));
    const rateFormatted = parseFloat(ethers.formatEther(exchangeRate));
    
    // Calculate beacon chain ETH (TVL - visible balances)
    const depositQueueETH = parseFloat(ethers.formatEther(depositQueueBalance));
    const withdrawQueueETH = parseFloat(ethers.formatEther(withdrawQueueBalance));
    const totalPodBalance = operatorData.reduce((sum, op) => sum + parseFloat(op.podBalance), 0);
    const beaconChainETH = totalTVLFormatted - depositQueueETH - withdrawQueueETH - totalPodBalance;
    const estimatedValidators = Math.floor(beaconChainETH / 32);

    const response = {
      timestamp: new Date().toISOString(),
      core: {
        totalSupply: totalSupplyFormatted,
        totalTVL: totalTVLFormatted,
        exchangeRate: rateFormatted,
        isPaused,
      },
      balances: {
        depositQueue: depositQueueETH,
        withdrawQueue: withdrawQueueETH,
        totalEigenPods: totalPodBalance,
        beaconChain: beaconChainETH,
      },
      withdrawal: {
        coolDownPeriod: Number(coolDownPeriod),
        coolDownDays: Number(coolDownPeriod) / 86400,
        totalRequests: Number(withdrawNonce),
      },
      validators: {
        estimated: estimatedValidators,
        totalStaked: estimatedValidators * 32,
      },
      operators: operatorData,
      contracts: CONTRACTS,
      distribution: {
        beaconChainPct: (beaconChainETH / totalTVLFormatted) * 100,
        withdrawQueuePct: (withdrawQueueETH / totalTVLFormatted) * 100,
        depositQueuePct: (depositQueueETH / totalTVLFormatted) * 100,
        eigenPodsPct: (totalPodBalance / totalTVLFormatted) * 100,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching Renzo data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch on-chain data', details: String(error) },
      { status: 500 }
    );
  }
}
