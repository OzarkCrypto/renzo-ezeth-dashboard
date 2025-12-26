'use client';

import { useState, useEffect } from 'react';

const RPC_URL = "https://rpc.mevblocker.io";

const CONTRACTS = {
  EZETH_TOKEN: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
  RESTAKE_MANAGER: "0x74a09653A083691711cF8215a6ab074BB4e99ef5",
  DEPOSIT_QUEUE: "0xf2F305D14DCD8aaef887E0428B3c9534795D0d60",
  WITHDRAW_QUEUE: "0x5efc9D10E42FB517456f4ac41EB5e2eBe42C8918",
  RATE_PROVIDER: "0x387dBc0fB00b26fb085aa658527D5BE98302c84C",
};

const OPERATORS = [
  { name: "Figment", od: "0x78524bEeAc12368e600457478738c233f436e9f6", pod: "0x35Cb1491dCf4C0AB6b413AfC42298e32f13FF524" },
  { name: "P2P.org", od: "0x125B367C16C5858f11e12948404F7a1371a0FDa3", pod: "0xd4018Ce9A041a9c110A9d0383d2b5E1c66Ae1513" },
  { name: "Luganodes", od: "0x0B1981a9Fcc24A445dE15141390d3E46DA0e425c", pod: "0x093f6C270aC22EC240f0C6fd7414Ea774ca8d3e5" },
  { name: "HashKey", od: "0xbaf5f3a05bd7af6f3a0bba207803bf77e2657c8f", pod: "0x2641C2ded63a0C640629F5eDF1189e0f53C06561" },
  { name: "Pier Two", od: "0x38cDB1A8207264C1A07c42c43A4c3ED4bfab7CEA", pod: "0xDD0212d0da33a2235d1952dA390a0A18EAcc7af5" },
];

interface RpcResponse {
  result: string;
}

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const json: RpcResponse = await res.json();
  return json.result;
}

const hex = (h: string | null) => h && h !== '0x' ? parseInt(h, 16) : 0;
const toEth = (w: number) => w / 1e18;
const fmt = (n: number, d = 2) => n >= 1e6 ? (n/1e6).toFixed(d)+'M' : n >= 1e3 ? (n/1e3).toFixed(d)+'K' : n.toFixed(d);
const addr = (a: string) => a.slice(0,6) + '...' + a.slice(-4);

interface DashboardData {
  supply: number;
  rate: number;
  tvl: number;
  depositQ: number;
  withdrawQ: number;
  totalPods: number;
  beacon: number;
  validators: number;
  cooldown: number;
  requests: number;
  operators: Array<{ name: string; od: string; pod: string; bal: number }>;
  dist: { beacon: number; withdraw: number; deposit: number; pods: number };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      const results = await Promise.all([
        rpcCall('eth_call', [{ to: CONTRACTS.EZETH_TOKEN, data: '0x18160ddd' }, 'latest']),
        rpcCall('eth_call', [{ to: CONTRACTS.RATE_PROVIDER, data: '0x679aefce' }, 'latest']),
        rpcCall('eth_call', [{ to: CONTRACTS.RESTAKE_MANAGER, data: '0xff9969cd' }, 'latest']),
        rpcCall('eth_getBalance', [CONTRACTS.DEPOSIT_QUEUE, 'latest']),
        rpcCall('eth_getBalance', [CONTRACTS.WITHDRAW_QUEUE, 'latest']),
        rpcCall('eth_call', [{ to: CONTRACTS.WITHDRAW_QUEUE, data: '0xf6f44d2e' }, 'latest']),
        rpcCall('eth_call', [{ to: CONTRACTS.WITHDRAW_QUEUE, data: '0x9b4d9f33' }, 'latest']),
        ...OPERATORS.map(o => rpcCall('eth_getBalance', [o.pod, 'latest']))
      ]);

      const [supply, rate, tvl, dq, wq, cd, nonce, ...pods] = results;

      const tvlHex = tvl?.slice(2) || '';
      const totalTVL = toEth(hex('0x' + tvlHex.slice(128, 192)));
      const depositQ = toEth(hex(dq));
      const withdrawQ = toEth(hex(wq));
      const podBals = pods.map(p => toEth(hex(p)));
      const totalPods = podBals.reduce((a, b) => a + b, 0);
      const beacon = totalTVL - depositQ - withdrawQ - totalPods;

      setData({
        supply: toEth(hex(supply)),
        rate: toEth(hex(rate)),
        tvl: totalTVL,
        depositQ, withdrawQ, totalPods, beacon,
        validators: Math.floor(beacon / 32),
        cooldown: hex(cd) / 86400,
        requests: hex(nonce),
        operators: OPERATORS.map((o, i) => ({ ...o, bal: podBals[i] })),
        dist: {
          beacon: (beacon / totalTVL) * 100,
          withdraw: (withdrawQ / totalTVL) * 100,
          deposit: (depositQ / totalTVL) * 100,
          pods: (totalPods / totalTVL) * 100
        }
      });
      setTime(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!data) return <div className="p-4 text-red-500">Error loading data</div>;

  return (
    <div className="min-h-screen bg-white text-gray-900 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">R</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Renzo ezETH</h1>
              <p className="text-xs text-gray-400">On-Chain Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            {time?.toLocaleTimeString()}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { l: 'Supply', v: fmt(data.supply), u: 'ezETH', c: 'text-emerald-600' },
            { l: 'TVL', v: fmt(data.tvl), u: 'ETH', c: 'text-blue-600' },
            { l: 'Rate', v: data.rate.toFixed(4), u: 'ETH/ezETH', c: 'text-amber-600' },
            { l: 'Validators', v: fmt(data.validators, 0), u: '~est', c: 'text-purple-600' }
          ].map((m, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">{m.l}</p>
              <p className="text-xl font-bold">{m.v}</p>
              <p className={`text-xs ${m.c}`}>{m.u}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-xs text-gray-500 mb-2">Fund Distribution</p>
          <div className="h-6 rounded-full overflow-hidden flex bg-gray-200 mb-3">
            <div className="bg-emerald-500" style={{ width: `${data.dist.beacon}%` }}></div>
            <div className="bg-amber-500" style={{ width: `${data.dist.withdraw}%` }}></div>
            <div className="bg-blue-500" style={{ width: `${Math.max(data.dist.pods, 0.5)}%` }}></div>
            <div className="bg-purple-500" style={{ width: `${Math.max(data.dist.deposit, 0.5)}%` }}></div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {[
              { l: 'Beacon Chain', v: data.beacon, p: data.dist.beacon, c: 'bg-emerald-500' },
              { l: 'Withdraw Queue', v: data.withdrawQ, p: data.dist.withdraw, c: 'bg-amber-500' },
              { l: 'EigenPods', v: data.totalPods, p: data.dist.pods, c: 'bg-blue-500' },
              { l: 'Deposit Queue', v: data.depositQ, p: data.dist.deposit, c: 'bg-purple-500' }
            ].map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-sm ${d.c}`}></div>
                <div>
                  <p className="text-gray-500">{d.l}</p>
                  <p className="font-semibold text-gray-900">{fmt(d.v)} <span className="text-gray-400">({d.p.toFixed(1)}%)</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">Withdrawal</p>
            <div className="flex justify-between">
              <div><p className="text-lg font-bold">{data.cooldown}d</p><p className="text-xs text-gray-500">cooldown</p></div>
              <div className="text-right"><p className="text-lg font-bold">{data.requests.toLocaleString()}</p><p className="text-xs text-gray-500">requests</p></div>
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
            <p className="text-xs text-purple-600 mb-1">Staking</p>
            <div className="flex justify-between">
              <div><p className="text-lg font-bold">~{data.validators.toLocaleString()}</p><p className="text-xs text-gray-500">validators</p></div>
              <div className="text-right"><p className="text-lg font-bold">{fmt(data.validators * 32)}</p><p className="text-xs text-gray-500">staked ETH</p></div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-xs text-gray-500 mb-2">Operator Delegators</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
                <th className="pb-2">Operator</th>
                <th className="pb-2">OD Contract</th>
                <th className="pb-2">EigenPod</th>
                <th className="pb-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.operators.map((o, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium">{o.name}</td>
                  <td className="py-2">
                    <a href={`https://etherscan.io/address/${o.od}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-mono text-xs">{addr(o.od)}</a>
                  </td>
                  <td className="py-2">
                    <a href={`https://etherscan.io/address/${o.pod}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-mono text-xs">{addr(o.pod)}</a>
                  </td>
                  <td className="py-2 text-right font-mono text-xs">{o.bal.toFixed(4)} ETH</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Contracts</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(CONTRACTS).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-1">
                <span className="text-gray-500">{k.replace(/_/g, ' ')}</span>
                <a href={`https://etherscan.io/address/${v}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-mono">{addr(v)}</a>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-gray-400">
          Data from Ethereum RPC · 
          <a href="https://etherscan.io/token/0xbf5495Efe5DB9ce00f80364C8B423567e58d2110" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1">Etherscan</a> · 
          <a href="https://defillama.com/protocol/renzo" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1">DefiLlama</a> · 
          <a href="https://dune.com/renzoprotocol/renzo" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1">Dune</a>
        </div>
      </div>
    </div>
  );
}
