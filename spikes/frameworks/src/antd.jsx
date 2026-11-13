import { createRoot } from "react-dom/client";
import { useState } from "react";
import { DatePicker, Form, Input, Radio, Select } from "antd";

function App() {
  const [form] = Form.useForm();
  const [state, setState] = useState({});
  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_changed, all) => setState({ ...all, birth: all.birth ? all.birth.format("YYYY-MM-DD") : null })}
      onFinish={() => {}}
    >
      <h1>Ant Design</h1>
      <Form.Item label="Full name" name="name"><Input /></Form.Item>
      <Form.Item label="Country" name="country">
        <Select options={[{ value: "FR", label: "France" }, { value: "SN", label: "Sénégal" }, { value: "CA", label: "Canada" }]} showSearch optionFilterProp="label" />
      </Form.Item>
      <Form.Item label="Date of birth" name="birth"><DatePicker /></Form.Item>
      <Form.Item label="Status" name="status">
        <Radio.Group options={[{ value: "employed", label: "Employed" }, { value: "student", label: "Student" }]} />
      </Form.Item>
      <h2>Framework state</h2>
      <pre id="state">{JSON.stringify(state)}</pre>
    </Form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
