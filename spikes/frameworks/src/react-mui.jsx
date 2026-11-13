import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Autocomplete, Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

const cities = ["Paris", "Pau", "Lyon", "Lille", "Dakar", "Thiès", "Montréal"];

function App() {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState(null);
  const [date, setDate] = useState(null);
  const [agree, setAgree] = useState(false);
  const state = { name, country, city, date: date ? date.format("YYYY-MM-DD") : null, agree };
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Stack spacing={2} component="form" onSubmit={(e) => e.preventDefault()}>
        <h1>MUI</h1>
        <TextField id="mui-name" label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <FormControl>
          <InputLabel id="mui-country-label">Country</InputLabel>
          <Select labelId="mui-country-label" id="mui-country" label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <MenuItem value="FR">France</MenuItem>
            <MenuItem value="SN">Senegal</MenuItem>
          </Select>
        </FormControl>
        <Autocomplete id="mui-city" options={cities} value={city} onChange={(_e, v) => setCity(v)} renderInput={(p) => <TextField {...p} label="City (Autocomplete)" />} />
        <DatePicker label="Date of birth" value={date} onChange={(v) => setDate(v)} />
        <FormControlLabel control={<Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} />} label="I agree (never ticked automatically)" />
        <h2>Framework state</h2>
        <pre id="state">{JSON.stringify(state)}</pre>
      </Stack>
    </LocalizationProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
