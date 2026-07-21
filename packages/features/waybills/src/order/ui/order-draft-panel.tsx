import { Button } from '@zhili/ui';
import { useRef, useState } from 'react';
import {
  buildOrderRequest,
  memoryOrderPort,
  type OrderPort,
  type OrderResult,
  type OrderType,
} from '../model/order';
import './order-draft-panel.css';

interface PackageRow {
  id: number;
  ref: string;
  weight: string;
  dimensions: string;
}
interface CommodityRow {
  id: number;
  description: string;
  hs: string;
  quantity: string;
}

export interface OrderDraftPanelProps {
  port?: OrderPort;
  readOnly?: boolean;
}

export function OrderDraftPanel({
  port = memoryOrderPort,
  readOnly = false,
}: OrderDraftPanelProps) {
  const [type, setType] = useState<OrderType>('STANDARD');
  const [packages, setPackages] = useState<PackageRow[]>([
    { id: 1, ref: 'PKG-01', weight: '122.00', dimensions: '100 × 80 × 60' },
  ]);
  const [commodities, setCommodities] = useState<CommodityRow[]>([
    { id: 1, description: '电子产品及配件', hs: '8504900000', quantity: '5' },
  ]);
  const nextId = useRef(2);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const request = () => ({
    ...buildOrderRequest(type),
    packages: packages.map((item, index) => {
      const [lengthCm = '0', widthCm = '0', heightCm = '0'] = item.dimensions.split(/\s*[×x]\s*/);
      return {
        packageRef: item.ref,
        weightKg: item.weight,
        lengthCm,
        widthCm,
        heightCm,
        commodityDescription: commodities[index]?.description ?? commodities[0]?.description ?? '',
      };
    }),
  });

  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setMessage('');
    setError('');
    try {
      await operation();
    } catch {
      setError('订单命令失败；可能是校验或版本冲突，草稿内容已保留。');
    } finally {
      setPending(false);
    }
  };

  const ensureOrder = async () => order ?? port.save(request());
  return (
    <section className="order-draft">
      <header>
        <div>
          <h1>新建预报</h1>
          <p>标准运单与 Amazon FBA 共用地址、包裹、品名和报价校验。</p>
        </div>
        <span>草稿 ORD-DRAFT-0268</span>
      </header>
      <fieldset className="order-type">
        <legend>订单类型</legend>
        <label>
          <input
            type="radio"
            name="orderType"
            checked={type === 'STANDARD'}
            disabled={readOnly}
            onChange={() => setType('STANDARD')}
          />
          标准运单
        </label>
        <label>
          <input
            type="radio"
            name="orderType"
            checked={type === 'FBA'}
            disabled={readOnly}
            onChange={() => setType('FBA')}
          />
          FBA 入仓
        </label>
      </fieldset>
      {type === 'FBA' ? (
        <fieldset className="order-fba">
          <legend>Amazon FBA 关联</legend>
          <label>
            Amazon Shipment ID
            <input aria-label="Amazon Shipment ID" defaultValue="FBA15LAX20260722" />
          </label>
          <label>
            FBA 箱数
            <input aria-label="FBA 箱数" type="number" defaultValue={5} />
          </label>
          <label>
            目标仓
            <input defaultValue="LAX9" />
          </label>
        </fieldset>
      ) : null}
      <fieldset>
        <legend>包裹</legend>
        {packages.map((row, index) => (
          <div className="order-row" key={row.id}>
            <input
              aria-label={`包裹编号 ${index + 1}`}
              value={row.ref}
              disabled={readOnly}
              onChange={(event) =>
                setPackages((items) =>
                  items.map((item) =>
                    item.id === row.id ? { ...item, ref: event.target.value } : item
                  )
                )
              }
            />
            <input
              aria-label={`包裹重量 ${index + 1}`}
              value={row.weight}
              disabled={readOnly}
              onChange={(event) =>
                setPackages((items) =>
                  items.map((item) =>
                    item.id === row.id ? { ...item, weight: event.target.value } : item
                  )
                )
              }
            />
            <input
              aria-label={`包裹尺寸 ${index + 1}`}
              value={row.dimensions}
              disabled={readOnly}
              onChange={(event) =>
                setPackages((items) =>
                  items.map((item) =>
                    item.id === row.id ? { ...item, dimensions: event.target.value } : item
                  )
                )
              }
            />
          </div>
        ))}
        <Button
          variant="secondary"
          size="compact"
          disabled={readOnly}
          onClick={() =>
            setPackages((items) => [
              ...items,
              {
                id: nextId.current++,
                ref: `PKG-${String(items.length + 1).padStart(2, '0')}`,
                weight: '',
                dimensions: '',
              },
            ])
          }
        >
          新增包裹
        </Button>
      </fieldset>
      <fieldset>
        <legend>品名</legend>
        {commodities.map((row, index) => (
          <div className="order-row" key={row.id}>
            <input
              aria-label={`品名描述 ${index + 1}`}
              value={row.description}
              disabled={readOnly}
              onChange={(event) =>
                setCommodities((items) =>
                  items.map((item) =>
                    item.id === row.id ? { ...item, description: event.target.value } : item
                  )
                )
              }
            />
            <input
              aria-label={`HS 编码 ${index + 1}`}
              value={row.hs}
              disabled={readOnly}
              onChange={(event) =>
                setCommodities((items) =>
                  items.map((item) =>
                    item.id === row.id ? { ...item, hs: event.target.value } : item
                  )
                )
              }
            />
            <input
              aria-label={`品名数量 ${index + 1}`}
              value={row.quantity}
              disabled={readOnly}
              onChange={(event) =>
                setCommodities((items) =>
                  items.map((item) =>
                    item.id === row.id ? { ...item, quantity: event.target.value } : item
                  )
                )
              }
            />
          </div>
        ))}
        <Button
          variant="secondary"
          size="compact"
          disabled={readOnly}
          onClick={() =>
            setCommodities((items) => [
              ...items,
              { id: nextId.current++, description: '', hs: '', quantity: '1' },
            ])
          }
        >
          新增品名
        </Button>
      </fieldset>
      <footer>
        <Button
          variant="secondary"
          disabled={readOnly || pending}
          onClick={() =>
            void run(async () => {
              const saved = await port.save(request());
              setOrder(saved);
              setMessage(`草稿 ${saved.orderNo} 已保存`);
            })
          }
        >
          {pending ? '处理中…' : '保存草稿'}
        </Button>
        <Button
          variant="secondary"
          disabled={readOnly || pending}
          onClick={() =>
            void run(async () => {
              const current = await ensureOrder();
              setOrder(current);
              const validation = await port.validate(current.id, current.version);
              setMessage(validation.valid ? '校验通过，可以提交预报' : '校验失败，请修正错误项');
            })
          }
        >
          预校验
        </Button>
        <Button
          variant="secondary"
          disabled={readOnly || pending}
          onClick={() =>
            void run(async () => {
              const current = await ensureOrder();
              const copied = await port.copy(current.id, current.version);
              setOrder(copied);
              setMessage(`已复制为 ${copied.orderNo}`);
            })
          }
        >
          复制订单
        </Button>
        <Button
          disabled={readOnly || pending}
          onClick={() =>
            void run(async () => {
              const current = await ensureOrder();
              const submitted = await port.submit(current.id, current.version);
              setOrder(submitted);
              setMessage(`订单 ${submitted.orderNo} 已提交预报`);
            })
          }
        >
          提交预报
        </Button>
      </footer>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
