import { Button } from '@zhili/ui';
import { useState } from 'react';
import type { OrderType } from '../model/order';
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

export function OrderDraftPanel() {
  const [type, setType] = useState<OrderType>('STANDARD');
  const [packages, setPackages] = useState<PackageRow[]>([
    { id: 1, ref: 'PKG-01', weight: '122.00', dimensions: '100 × 80 × 60' },
  ]);
  const [commodities, setCommodities] = useState<CommodityRow[]>([
    { id: 1, description: '电子产品及配件', hs: '8504900000', quantity: '5' },
  ]);
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
            onChange={() => setType('STANDARD')}
          />
          标准运单
        </label>
        <label>
          <input
            type="radio"
            name="orderType"
            checked={type === 'FBA'}
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
          onClick={() =>
            setPackages((items) => [
              ...items,
              {
                id: Date.now(),
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
          onClick={() =>
            setCommodities((items) => [
              ...items,
              { id: Date.now(), description: '', hs: '', quantity: '1' },
            ])
          }
        >
          新增品名
        </Button>
      </fieldset>
      <footer>
        <Button variant="secondary">保存草稿</Button>
        <Button>提交预报</Button>
      </footer>
    </section>
  );
}
