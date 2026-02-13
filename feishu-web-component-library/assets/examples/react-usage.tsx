import React from 'react';

/**
 * Example integration skeleton for a Feishu-aligned web component library.
 * Replace component imports with your actual implementation.
 */
export function FeishuPageExample() {
  return (
    <main style={{ padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>招聘管理</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="secondary">导出</Button>
          <Button variant="primary">新建候选人</Button>
        </div>
      </header>

      <Card>
        <Form layout="horizontal" columns={2}>
          <Input label="姓名" placeholder="请输入姓名" />
          <Input label="手机号" placeholder="请输入手机号" />
          <Select label="评估状态" options={["通过", "待评估", "淘汰"]} />
          <Select label="招聘渠道" options={["内推", "官网", "猎头"]} />
        </Form>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Table
          density="default"
          columns={[
            { key: 'name', title: 'User' },
            { key: 'type', title: 'Type' },
            { key: 'status', title: 'Status' },
            { key: 'actions', title: 'Actions' }
          ]}
          data={[]}
          empty={<EmptyState title="暂无数据" description="请调整筛选条件" />}
        />
        <footer style={{ marginTop: 12 }}>
          <Pagination current={1} total={0} pageSize={20} showQuickJumper showSizeChanger />
        </footer>
      </Card>

      <section style={{ marginTop: 16, display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <Card title="任务进度">
          <Loading type="progress" percent={66} text="处理中" />
        </Card>
        <Card title="转化趋势">
          <Chart type="line" palette="categorical" data={[]} />
        </Card>
      </section>

      <Tooltip content="快捷创建候选人">
        <Button variant="fab" icon="plus" aria-label="新建" />
      </Tooltip>
    </main>
  );
}

// Placeholder declarations for demonstration.
declare function Button(props: any): JSX.Element;
declare function Card(props: any): JSX.Element;
declare function Input(props: any): JSX.Element;
declare function Select(props: any): JSX.Element;
declare function Form(props: any): JSX.Element;
declare function Table(props: any): JSX.Element;
declare function Pagination(props: any): JSX.Element;
declare function EmptyState(props: any): JSX.Element;
declare function Loading(props: any): JSX.Element;
declare function Chart(props: any): JSX.Element;
declare function Tooltip(props: any): JSX.Element;
