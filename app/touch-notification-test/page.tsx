"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { Generator } from "@/utils/generator";
import { FieldPath, FieldSchema, FormModel } from "@/utils/structures";

type WatchedField = {
  key: string;
  label: string;
  path: FieldPath;
};

type TouchLog = {
  id: number;
  timestamp: number;
  path: string;
  touch: boolean;
};

const WATCHED_FIELDS: WatchedField[] = [
  { key: "root", label: "表单根节点", path: [] },
  { key: "profile", label: "profile 对象", path: ["profile"] },
  { key: "name", label: "profile.name", path: ["profile", "name"] },
  { key: "email", label: "profile.email", path: ["profile", "email"] },
  { key: "remark", label: "remark", path: ["remark"] },
];

const pathLabel = (path: FieldPath) =>
  path.length ? path.join(".") : "<root>";

export default function TouchNotificationTestPage() {
  const schema = useMemo(
    () => ({
      fields: [
        {
          key: "profile",
          isArray: false,
          childrenFields: [
            {
              key: "name",
              label: "姓名",
              control: "input",
              defaultValue: "Alice",
            },
            {
              key: "email",
              label: "邮箱",
              control: "input",
              defaultValue: "alice@example.com",
            },
          ],
        },
        {
          key: "remark",
          label: "备注",
          control: "input",
          defaultValue: "初始备注",
        },
      ] satisfies FieldSchema[],
    }),
    [],
  );

  const [model] = useState(() => new FormModel(schema));
  const [logs, setLogs] = useState<TouchLog[]>([]);
  const [listening, setListening] = useState(true);
  const [selectedFieldKey, setSelectedFieldKey] = useState("name");
  const [selectedTouch, setSelectedTouch] = useState(true);

  useSyncExternalStore(
    model.subscribe.bind(model),
    model.getSnapshot.bind(model),
    model.getSnapshot.bind(model),
  );

  useEffect(() => {
    model.initial();
    console.log(model);
  }, [model]);

  useEffect(() => {
    if (!listening) return;

    const unsubscribe = WATCHED_FIELDS.map(({ path }) =>
      model.onFieldStateChange(path, "touch", (touch) => {
        setLogs((previous) =>
          [
            {
              id: Date.now() + Math.random(),
              timestamp: Date.now(),
              path: pathLabel(path),
              touch,
            },
            ...previous,
          ].slice(0, 100),
        );
      }),
    );

    return () => unsubscribe.forEach((fn) => fn());
  }, [listening, model]);

  const setTouch = (path: FieldPath, touch: boolean) => {
    model.setTouch(path, touch, true);
  };

  const applySelectedTouch = () => {
    const field = WATCHED_FIELDS.find(({ key }) => key === selectedFieldKey);
    if (field) setTouch(field.path, selectedTouch);
  };

  const setNameWithTouch = () => {
    model.setValue(
      [],
      {
        profile: {
          name: `用户输入-${Date.now().toString().slice(-4)}`,
        },
      },
      undefined,
      { setTouch: true },
      true,
    );
  };

  const resetAll = () => model.setTouch([], false, true);

  const counts = logs.reduce<Record<string, number>>((result, item) => {
    result[item.path] = (result[item.path] ?? 0) + 1;
    return result;
  }, {});

  const rows = WATCHED_FIELDS.map((field) => ({
    ...field,
    current: model.getTouch(field.path),
    count: counts[pathLabel(field.path)] ?? 0,
  }));

  return (
    <main className="mx-auto my-8 w-11/12 max-w-6xl">
      <Card title="Touch 通知监听测试">
        <Alert
          showIcon
          type="info"
          message="测试目标"
          description="通过 onFieldStateChange(path, 'touch', callback) 同时监听叶子、父对象和表单根节点。选择字段与 touch 值并执行后，对照实时状态与回调日志，验证通知值、传播范围和去重是否符合预期。"
        />

        <Divider />

        <Typography.Title level={5}>可编辑表单</Typography.Title>
        <Typography.Paragraph type="secondary">
          直接编辑输入框只改变值，不会自动设置 touch；“setValue +
          setTouch”按钮用于验证显式开启该行为的调用。
        </Typography.Paragraph>
        <Generator model={model} displayFields={[["profile"], ["remark"]]} />

        <Divider />

        <Typography.Title level={5}>测试操作</Typography.Title>
        <Space wrap align="center">
          <Select
            aria-label="选择字段"
            value={selectedFieldKey}
            style={{ width: 220 }}
            onChange={setSelectedFieldKey}
            options={WATCHED_FIELDS.map(({ key, label, path }) => ({
              value: key,
              label: `${label}（${pathLabel(path)}）`,
            }))}
          />
          <Radio.Group
            aria-label="选择 touch 值"
            value={selectedTouch}
            optionType="button"
            buttonStyle="solid"
            onChange={(event) => setSelectedTouch(event.target.value)}
            options={[
              { label: "touch = true", value: true },
              { label: "touch = false", value: false },
            ]}
          />
          <Button type="primary" onClick={applySelectedTouch}>
            执行设置
          </Button>
          <Button onClick={setNameWithTouch}>setValue(name) + setTouch</Button>
          <Button danger onClick={resetAll}>
            全部 touch → false
          </Button>
        </Space>

        <Alert
          className="mt-4"
          type="warning"
          showIcon
          message="推荐验证顺序"
          description="先清空日志并全部重置；name → true 应依次通知 root、profile、name；再次点击不应新增日志；email → true 只应通知 email；profile → false 应通知 profile、name、email，并在没有其他 touch 时通知 root。"
        />

        <Divider />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Typography.Title level={5} style={{ margin: 0 }}>
            实时监听状态
          </Typography.Title>
          <Space wrap>
            <Tag color={listening ? "green" : "default"}>
              {listening ? "监听中" : "已取消监听"}
            </Tag>
            <Button onClick={() => setListening((value) => !value)}>
              {listening ? "取消全部监听" : "重新订阅"}
            </Button>
            <Button onClick={() => setLogs([])}>清空日志/计数</Button>
          </Space>
        </div>

        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: "监听节点", dataIndex: "label" },
            {
              title: "路径",
              render: (_, row) => (
                <Typography.Text code>{pathLabel(row.path)}</Typography.Text>
              ),
            },
            {
              title: "当前 touch",
              dataIndex: "current",
              render: (value: boolean) => (
                <Tag color={value ? "orange" : "green"}>{String(value)}</Tag>
              ),
            },
            { title: "回调次数", dataIndex: "count" },
          ]}
        />

        <Divider />

        <Typography.Title level={5}>
          回调日志（最新在前，最多 100 条）
        </Typography.Title>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: listening ? "尚未收到 touch 通知" : "监听已取消",
          }}
          dataSource={logs}
          columns={[
            {
              title: "时间",
              width: 130,
              render: (_, row) => new Date(row.timestamp).toLocaleTimeString(),
            },
            { title: "路径", dataIndex: "path" },
            {
              title: "通知值",
              dataIndex: "touch",
              render: (value: boolean) => (
                <Tag color={value ? "orange" : "green"}>{String(value)}</Tag>
              ),
            },
          ]}
        />
      </Card>
    </main>
  );
}
