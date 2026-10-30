const hashedPassword = await bcrypt.hash("manyagupta", 10);

await User.create({
  name: "Manya Gupta",
  email: "user@test.com",
  password: hashedPassword,
  role: "admin",
});