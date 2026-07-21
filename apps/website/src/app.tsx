import { ArrowRight, Bot, Boxes, CircleDollarSign, Route, ScanLine } from 'lucide-react';
import { Button, StatusTag } from '@zhili/ui';

export function App() {
  return (
    <div className="site">
      <header>
        <a className="site-logo" href="#top">
          <span>智</span>智立科技物流AI系统
        </a>
        <nav aria-label="官网导航">
          <a href="#product">产品能力</a>
          <a href="#solutions">解决方案</a>
          <a href="#security">安全与开放</a>
          <a href="#contact">联系我们</a>
        </nav>
        <Button variant="secondary">登录系统</Button>
      </header>
      <main id="top">
        <section className="site-hero">
          <div className="site-hero-copy">
            <h1>把跨境物流的订单、仓配、轨迹与结算，放进同一个工作系统</h1>
            <p>
              从客户预报到仓库实收，从多渠道报价到尾程 POD，再到应收应付与 AI
              自动化，关键状态始终可追溯。
            </p>
            <div>
              <Button size="large">
                预约演示 <ArrowRight size={16} />
              </Button>
              <Button size="large" variant="secondary">
                查看产品能力
              </Button>
            </div>
            <small>适用于国际专线、跨境货代、自主装柜、快递小包与尾程服务商</small>
          </div>
          <div className="site-product" aria-label="智立系统产品预览">
            <div className="site-product-top">
              <strong>智立科技物流AI系统</strong>
              <span>智立科技（深圳）有限公司</span>
              <input aria-label="产品预览搜索" value="S2505120004" readOnly />
            </div>
            <aside>
              <span>运营工作台</span>
              <span>订单运单</span>
              <span data-active>仓库作业</span>
              <span>轨迹客服</span>
              <span>财务结算</span>
            </aside>
            <section>
              <div className="site-product-title">
                <div>
                  <small>收货工作台</small>
                  <h2>S2505120004</h2>
                </div>
                <StatusTag tone="success">已收货</StatusTag>
              </div>
              <div className="site-product-measure">
                <div>
                  <span>预报重</span>
                  <strong>122.00 kg</strong>
                </div>
                <div>
                  <span>实收/计费重</span>
                  <strong>123.50 kg</strong>
                </div>
                <div>
                  <span>体积</span>
                  <strong>0.48 m³</strong>
                </div>
              </div>
              <div className="site-product-route">
                <span>CN-SZX</span>
                <i />
                <span>US-LAX</span>
              </div>
              <p>深圳鑫源贸易有限公司 · 差异 +1.50 kg（+1.23%）</p>
            </section>
          </div>
        </section>
        <section id="product" className="site-capabilities">
          <div>
            <h2>围绕真实物流闭环设计</h2>
            <p>不是零散工具拼接，而是由同一运单、同一费用和同一权限模型串起的业务系统。</p>
          </div>
          <ul>
            <li>
              <ScanLine />
              <strong>仓库扫描</strong>
              <span>收货、复重、量方、分货、装载、出库与离线补传。</span>
            </li>
            <li>
              <Route />
              <strong>履约轨迹</strong>
              <span>订舱、提单、清关、尾程派送、POD 与问题件协作。</span>
            </li>
            <li>
              <CircleDollarSign />
              <strong>物流结算</strong>
              <span>应收应付、账单、支付、核销、期间与利润回查。</span>
            </li>
            <li>
              <Bot />
              <strong>AI 自动化</strong>
              <span>报价解释、异常分类、导入映射与策略内自动动作。</span>
            </li>
          </ul>
        </section>
        <section id="solutions" className="site-flow">
          <div>
            <Boxes />
            <h2>一张运单贯穿全流程</h2>
            <p>预报 → 报价 → 收货 → 分货 → 干线 → 尾程 → 账单 → 核销</p>
            <Button>了解解决方案</Button>
          </div>
        </section>
      </main>
      <footer id="contact">
        <div>
          <strong>智立科技物流AI系统</strong>
          <span>让复杂物流协作更清楚、更稳、更可追溯。</span>
        </div>
        <nav>
          <a href="/privacy">隐私政策</a>
          <a href="/terms">服务条款</a>
          <a href="/license">开源许可</a>
        </nav>
      </footer>
    </div>
  );
}
