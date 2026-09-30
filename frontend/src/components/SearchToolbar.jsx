import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

export function SearchToolbar({
  search = '',
  onSearchChange,
  placeholder = 'Search...',
  children,
  debounceMs = 400,
}) {
  const [internalValue, setInternalValue] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);

  // Synchronize internal value if external search prop changes
  if (search !== prevSearch) {
    setPrevSearch(search);
    setInternalValue(search);
  }

  // Hand-written debounce without external lodash
  useEffect(() => {
    const handler = setTimeout(() => {
      if (internalValue !== search) {
        onSearchChange(internalValue);
      }
    }, debounceMs);

    return () => clearTimeout(handler);
  }, [internalValue, search, onSearchChange, debounceMs]);

  const handleClear = () => {
    setInternalValue('');
    onSearchChange('');
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        mb: 2.5,
      }}
    >
      <TextField
        size="small"
        placeholder={placeholder}
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        sx={{ minWidth: { xs: '100%', sm: 260 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
          endAdornment: internalValue ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear} edge="end" aria-label="Clear search">
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />
      {children}
    </Box>
  );
}
